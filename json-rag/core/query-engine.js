/**
 * JSON-RAG v5.2 查詢引擎
 * 實現混合查詢策略
 */

export class QueryEngine {
  constructor(adapters) {
    this.scannedCount = 0;
    this.adapters = adapters;
    this.strategies = {
      'filter-first': this.filterFirstStrategy.bind(this),
      'semantic-first': this.semanticFirstStrategy.bind(this),
      'parallel': this.parallelStrategy.bind(this)
    };
  }

  /**
   * 純結構化查詢（包括 FTS）
   */
  async structuralOnly(request) {
    // 如果有 semantic 查詢且 useEmbedding 為 false，使用 FTS
    if (request.semantic?.query && request.semantic.useEmbedding === false) {
      // GPT-5建議：雙向兼容，優先嘗試 fts，回退到 index.fulltext
      const fts = this.adapters?.fts ?? this.adapters?.index?.fulltext;
      
      if (fts && typeof fts.searchFTS === 'function') {
        console.log('[QueryEngine] Using FTS adapter:', fts.constructor.name);
        const ftsResults = await fts.searchFTS(request.semantic.query, {
          limit: request.semantic.limit || 100
        });
        
        // 如果有結構化過濾，應用過濾
        if (request.structural) {
          return this.applyStructuralFilters(ftsResults, request.structural);
        }
        
        return await this.hydrateFTSResults(ftsResults);
      } else if (fts && typeof fts.search === 'function') {
        // 兼容可能的 search 方法
        console.log('[QueryEngine] Using FTS adapter with search method:', fts.constructor.name);
        const ftsResults = await fts.search({
          query: request.semantic.query,
          limit: request.semantic.limit || 100
        });
        
        // 如果有結構化過濾，應用過濾
        if (request.structural) {
          return this.applyStructuralFilters(ftsResults, request.structural);
        }
        
        return await this.hydrateFTSResults(ftsResults);
      } else {
        console.warn('[QueryEngine] No FTS adapter found or searchFTS method not available');
      }
    }
    
    // 否則執行純結構化查詢
    return this.structuralFilter(request.structural || {});
  }


  /**
   * 執行搜索
   * @param {SearchRequest} request
   * @returns {Promise<SearchResult>}
   */
  async search(request) {
    const startTime = Date.now();
    const strategy = request.hybrid || 'filter-first';

    // 選擇策略
    const strategyFn = this.strategies[strategy] || this.structuralOnly.bind(this);

    // 執行查詢
    let results = await strategyFn(request);

    // 添加引用信息
    results = await this.addCitations(results);

    // 構建響應
    const response = {
      results,
      totalCount: results.length,
      metrics: {
        latency: Date.now() - startTime,
        strategy,
        documentsScanned: this.getScannedCount(),
        cacheHit: false
      }
    };

    return response;
  }

  /**
   * 策略1：先結構化過濾，再語義增強
   */
  async filterFirstStrategy(request) {
    // 方案B修復：若沒有結構化過濾條件但是純FTS查詢，改走FTS路徑
    if ((!request.structural || Object.keys(request.structural || {}).length === 0) &&
        request.semantic?.query && request.semantic.useEmbedding === false &&
        (this.adapters?.fts || this.adapters?.index?.fulltext)) {
      console.log('[QueryEngine] No structural filter but pure FTS query, falling back to FTS');
      return this.structuralOnly(request);
    }

    // Step 1: 結構化過濾
    let candidates = await this.structuralFilter(request.structural);

    // 如果沒有結果，直接返回
    if (candidates.length === 0) {
      return candidates;
    }

    // 如果候選集太大，進一步過濾
    if (candidates.length > 1000 && request.structural?.limit) {
      candidates = candidates.slice(0, request.structural.limit * 10);
    }

    // Step 2: 全文搜索過濾（如果有）
    if (request.semantic?.query && this.adapters.fts) {
      candidates = await this.fulltextFilter(candidates, request.semantic.query);
    }

    // Step 3: 語義增強（如果需要）
    if (request.semantic?.useEmbedding && this.adapters.vector) {
      candidates = await this.semanticRerank(candidates, request.semantic);
    }

    // 應用最終限制
    if (request.structural?.limit) {
      candidates = candidates.slice(0, request.structural.limit);
    }

    return candidates;
  }

  /**
   * 策略2：先語義搜索，再結構化過濾
   */
    async semanticFirstStrategy(request) {
    // 如果是 semantic 搜索但 useEmbedding 為 false，使用 FTS
    if (request.semantic?.query && request.semantic.useEmbedding === false) {
      return this.structuralOnly(request);
    }
    
    if (!request.semantic || !this.adapters.vector) {
      // 降級到純結構化查詢
      return this.structuralOnly(request);
    }

    // Step 1: 語義搜索
    let candidates = await this.semanticSearch(request.semantic);

    // Step 2: 結構化過濾
    if (request.structural) {
      candidates = await this.applyStructuralFilters(candidates, request.structural);
    }

    // 應用限制
    const limit = request.structural?.limit || request.semantic?.limit || 100;
    return candidates.slice(0, limit);
  }

  /**
   * 策略3：並行查詢後合併
   */
  async parallelStrategy(request) {
    const promises = [];
    const sources = new Map();

    // 並行執行所有查詢
    if (request.structural) {
      promises.push(
        this.structuralFilter(request.structural)
          .then(results => {
            results.forEach(r => sources.set(r.id, { ...r, source: 'structural' }));
          })
      );
    }

    if (request.semantic?.query && this.adapters.fts) {
      promises.push(
        this.fulltextSearch(request.semantic.query)
          .then(results => {
            results.forEach(r => {
              const existing = sources.get(r.id);
              if (existing) {
                existing.score = (existing.score || 0) + (r.score || 0);
                existing.source = 'both';
              } else {
                sources.set(r.id, { ...r, source: 'fulltext' });
              }
            });
          })
      );
    }

    if (request.semantic?.useEmbedding && this.adapters.vector) {
      promises.push(
        this.semanticSearch(request.semantic)
          .then(results => {
            results.forEach(r => {
              const existing = sources.get(r.id);
              if (existing) {
                existing.score = (existing.score || 0) + (r.score || 0);
                existing.source = existing.source === 'both' ? 'all' : 'mixed';
              } else {
                sources.set(r.id, { ...r, source: 'semantic' });
              }
            });
          })
      );
    }

    // 等待所有查詢完成
    await Promise.all(promises);

    // 合併結果
    let results = Array.from(sources.values());

    // 按分數排序
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    // 應用限制
    const limit = request.structural?.limit || 100;
    return results.slice(0, limit);
  }



  /**
   * 結構化過濾
   */
  async structuralFilter(criteria) {
    this.scannedCount = 0; // 重置計數器
    if (!criteria || !this.adapters.storage) {
      return [];
    }

    const filters = [];

    // 集合過濾
    if (criteria.collection) {
      const ids = await this.adapters.structural?.findByIndex('collection', criteria.collection) || [];
      if (ids.length > 0) {
        // 如果有結果，直接使用這些 ID
        const results = [];
        for (const id of ids) {
          // 構建完整的 key
          const key = `${criteria.collection}:${id}`;
          const doc = await this.adapters.storage.get(key);
          this.scannedCount++;
          if (doc) {
            results.push(doc);
          }
        }
        return results;
      }
    }

    // 時間範圍過濾
    if (criteria.timeRange) {
      const ids = await this.timeRangeFilter(criteria.timeRange);
      filters.push(new Set(ids));
    }

    // 標籤過濾
    if (criteria.tags && criteria.tags.length > 0) {
      const ids = await this.tagsFilter(criteria.tags);
      filters.push(new Set(ids));
    }

    // 元數據過濾
    if (criteria.metadata) {
      const ids = await this.metadataFilter(criteria.metadata);
      filters.push(new Set(ids));
    }

    // 如果沒有過濾條件，返回所有
    if (filters.length === 0) {
      return this.getAllDocuments();
    }

    // 計算交集
    const resultIds = this.intersectSets(filters);

    // 獲取文檔
    const results = [];
    for (const id of resultIds) {
      const doc = await this.adapters.storage.get(id);
      this.scannedCount++;
      if (doc) {
        results.push(doc);
      }
    }

    return results;
  }

  /**
   * 時間範圍過濾
   */
  async timeRangeFilter(timeRange) {
    const results = new Set();

    if (!this.adapters.structural) {
      return results;
    }

    // 這裡簡化處理，實際應該使用範圍查詢
    const allDocs = await this.getAllDocumentIds();
    
    for (const id of allDocs) {
      const doc = await this.adapters.storage.get(id);
      if (doc) {
        const timestamp = doc.updated_at || doc.created_at;
        const inRange = 
          (!timeRange.start || timestamp >= new Date(timeRange.start).getTime()) &&
          (!timeRange.end || timestamp <= new Date(timeRange.end).getTime());
        
        if (inRange) {
          results.add(id);
        }
      }
    }

    return results;
  }

  /**
   * 標籤過濾
   */
  async tagsFilter(tags) {
    const results = new Set();

    if (!this.adapters.structural) {
      return results;
    }

    // 獲取每個標籤的文檔
    for (const tag of tags) {
      const ids = await this.adapters.structural.findByIndex('tag', tag);
      ids.forEach(id => results.add(id));
    }

    return results;
  }

  /**
   * 元數據過濾
   */
  async metadataFilter(metadata) {
    const results = new Set();

    // 這裡需要更複雜的實現
    // 暫時返回空集
    return results;
  }

  /**
   * 全文搜索過濾
   */
  async fulltextFilter(candidates, query) {
    const fts = this.adapters?.fts ?? this.adapters?.index?.fulltext;
    if (!fts) {
      return candidates;
    }

    // 在候選集中進行全文搜索
    const ftsResults = await fts.searchFTS(query, {
      limit: candidates.length * 2  // 擴大搜索範圍
    });

    // 創建ID集合用於快速查找（注意：需要處理帶collection前綴的情況）
    const ftsIds = new Set(ftsResults.map(r => r.id || r.documentId));
    
    // 過濾候選集
    return candidates.filter(doc => {
      // 同時檢查 doc.id 和帶collection前綴的格式
      return ftsIds.has(doc.id) || ftsIds.has(`${doc.collection}:${doc.id}`);
    });
  }

  /**
   * 全文搜索
   */
  async fulltextSearch(query) {
    const fts = this.adapters?.fts ?? this.adapters?.index?.fulltext;
    if (!fts) {
      return [];
    }

    const results = await fts.searchFTS(query);
    return await this.hydrateFTSResults(results);
  }

  /**
   * 語義搜索
   */
  async semanticSearch(semantic) {
    if (!this.adapters.vector) {
      return [];
    }

    // 獲取查詢向量
    const queryVector = await this.getQueryEmbedding(semantic.query);
    if (!queryVector) {
      return [];
    }

    // 執行相似性搜索
    const k = semantic.limit || 100;
    const results = await this.adapters.vector.searchSimilar(queryVector, k);

    // 應用閾值過濾
    if (semantic.threshold) {
      return results.filter(r => r.score >= semantic.threshold);
    }

    return results;
  }

  /**
   * 語義重排序
   */
  async semanticRerank(candidates, semantic) {
    if (!this.adapters.vector || candidates.length === 0) {
      return candidates;
    }

    // 獲取查詢向量
    const queryVector = await this.getQueryEmbedding(semantic.query);
    if (!queryVector) {
      return candidates;
    }

    // 批量獲取候選文檔的向量
    const docVectors = await Promise.all(
      candidates.map(doc => this.adapters.vector.getEmbedding(doc.id))
    );

    // 計算相似度並排序
    const scored = candidates.map((doc, i) => {
      const vector = docVectors[i];
      if (!vector) {
        return { ...doc, score: 0 };
      }

      const similarity = this.cosineSimilarity(queryVector, vector);
      return { ...doc, score: similarity };
    });

    // 按相似度排序
    scored.sort((a, b) => b.score - a.score);

    // 應用閾值
    if (semantic.threshold) {
      return scored.filter(doc => doc.score >= semantic.threshold);
    }

    return scored;
  }

  /**
   * 應用結構化過濾器到結果集
   */
  async applyStructuralFilters(candidates, structural) {
    // 集合過濾
    if (structural.collection) {
      candidates = candidates.filter(doc => doc.collection === structural.collection);
    }

    // 時間範圍過濾
    if (structural.timeRange) {
      candidates = candidates.filter(doc => {
        const timestamp = doc.updated_at || doc.created_at;
        return (!structural.timeRange.start || timestamp >= new Date(structural.timeRange.start).getTime()) &&
               (!structural.timeRange.end || timestamp <= new Date(structural.timeRange.end).getTime());
      });
    }

    // 標籤過濾
    if (structural.tags && structural.tags.length > 0) {
      candidates = candidates.filter(doc => {
        if (!doc.tags || !Array.isArray(doc.tags)) return false;
        return structural.tags.some(tag => doc.tags.includes(tag));
      });
    }

    return candidates;
  }

  /**
   * 獲取查詢向量
   */
  async getQueryEmbedding(query) {
    // 嘗試使用嵌入服務
    if (this.adapters.embedder && typeof this.adapters.embedder.embed === 'function') {
      try {
        return await this.adapters.embedder.embed(query);
      } catch (error) {
        console.error('[QueryEngine] 嵌入生成失敗:', error);
      }
    }
    
    // 如果沒有嵌入服務，返回null並警告
    console.warn('[QueryEngine] 嵌入服務未配置，語義搜索功能將無法使用');
    return null;
  }

  /**
   * 計算餘弦相似度
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('向量維度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * 添加引用信息
   */
  async addCitations(results) {
    return results.map(result => ({
      ...result,
      citation: {
        source: result.source || 'json-rag',
        documentId: result.id,
        timestamp: result.updated_at || result.created_at,
        checksum: result.checksum || null,
        location: {
          collection: result.collection,
          offset: result.offset || 0,
          length: result.length || 0
        }
      }
    }));
  }

  /**
   * 計算集合交集
   */
  intersectSets(sets) {
    if (sets.length === 0) {
      return new Set();
    }

    if (sets.length === 1) {
      return sets[0];
    }

    // 從最小的集合開始
    sets.sort((a, b) => a.size - b.size);
    
    let result = new Set(sets[0]);
    
    for (let i = 1; i < sets.length; i++) {
      result = new Set([...result].filter(x => sets[i].has(x)));
      
      // 如果結果為空，提前返回
      if (result.size === 0) {
        break;
      }
    }

    return result;
  }

  /**
   * 獲取所有文檔
   */
  async getAllDocuments() {
    // 這裡需要實現分頁邏輯
    const ids = await this.getAllDocumentIds();
    const results = [];

    for (const id of ids) {
      const doc = await this.adapters.storage.get(id);
      this.scannedCount++;
      if (doc) {
        results.push(doc);
      }
    }

    return results;
  }

  /**
   * 獲取所有文檔ID
   */
  async getAllDocumentIds() {
    // 從存儲適配器獲取所有鍵
    if (this.adapters.storage && typeof this.adapters.storage.keys === 'function') {
      return await this.adapters.storage.keys();
    }
    console.warn('[QueryEngine] 存儲適配器未提供 keys 方法');
    return [];
  }

  /**
   * 獲取掃描的文檔數
   */
  getScannedCount() {
    // 返回實際掃描的文檔數
    return this.scannedCount;
  }

  /**
   * 純結構化查詢（包括FTS）- v5.2.1修復
   */
  async structuralOnly(request) {
    console.log('[QueryEngine] structuralOnly called with:', request);
    
    // 策略B：如果有semantic查詢且useEmbedding為false，使用FTS
    if (request.semantic?.query && request.semantic.useEmbedding === false) {
      console.log('[QueryEngine] Using FTS for semantic query without embedding');
      
      // 檢查FTS適配器是否存在（使用別名橋接）
      const ftsAdapter = this.adapters.fts || this.adapters.index?.fulltext;
      
      if (ftsAdapter && typeof ftsAdapter.searchFTS === 'function') {
        const ftsOptions = {
          limit: request.semantic.limit || 100,
          collection: request.structural?.collection
        };
        
        const ftsResults = await ftsAdapter.searchFTS(
          request.semantic.query,
          ftsOptions
        );
        
        console.log(`[QueryEngine] FTS returned ${ftsResults.length} results`);
        
        // 補水FTS結果
        if (typeof this.hydrateFTSResults === 'function') {
          return await this.hydrateFTSResults(ftsResults);
        }
        
        return ftsResults;
      } else {
        console.log('[QueryEngine] FTS adapter not found or searchFTS method missing');
      }
    }
    
    // 否則執行純結構化查詢
    return this.structuralFilter(request.structural || {});
  }

  /**
   * 補水FTS結果，獲取完整文檔數據
   * v5.2.1增強版 - 改進key匹配邏輯
   */
  async hydrateFTSResults(ftsResults) {
    if (!ftsResults || ftsResults.length === 0) return [];
    
    const hydrated = [];
    const seen = new Set(); // 去重用
    
    for (const result of ftsResults) {
      const docId = result.id || result.documentId;
      const collection = result.collection || 'default';
      
      // 去重檢查 - 基於collection和ID的組合
      const uniqueKey = `${collection}:${docId}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      
      // 嘗試多種鍵格式獲取完整文檔
      let fullDoc = null;
      const keyVariants = [
        `${collection}:${docId}`,  // 標準格式
        docId,                        // 純ID
        `${docId}`,                 // 字符串ID
        `default:${docId}`,         // 默認集合
        `test:${docId}`,            // 測試集合
        `articles:${docId}`,        // 文章集合
        `tutorials:${docId}`        // 教程集合
      ];
      
      for (const key of keyVariants) {
        try {
          fullDoc = await this.adapters.storage.get(key);
          if (fullDoc) {
            console.log(`[Hydration] Found document with key: ${key}`);
            break;
          }
        } catch (e) {
          // 繼續嘗試下一個格式
        }
      }
      
      // 如果還是找不到，嘗試直接查詢數據庫
      if (!fullDoc && this.adapters.storage.db) {
        try {
          const stmt = this.adapters.storage.db.prepare(
            'SELECT * FROM documents WHERE id = ? OR id = ? OR id LIKE ?'
          );
          const row = stmt.get(docId, `${collection}:${docId}`, `%:${docId}`);
          if (row) {
            fullDoc = {
              id: row.id,
              collection: row.collection || collection,
              data: JSON.parse(row.data),
              checksum: row.checksum,
              created_at: row.created_at,
              updated_at: row.updated_at
            };
            console.log(`[Hydration] Found document in DB: ${row.id}`);
          }
        } catch (e) {
          // 忽略錯誤
        }
      }
      
      // 組合完整結果
      const title = fullDoc?.data?.title || 
                    result.metadata?.title || 
                    result.snippet?.substring(0, 30) || 
                    'Untitled';
      
      hydrated.push({
        id: docId,
        collection: collection,
        data: fullDoc?.data || {},
        title: title,
        snippet: result.snippet || '',
        score: result.score || 0,
        hasFullData: !!fullDoc,
        // 保留原始資訊
        _source: 'fts',
        _original: result
      });
    }
    
    return hydrated;
  }
  
  /**
   * 添加引用信息（增強版）
   * v5.2.1優化 - 確保標題正確顯示
   */
  async addCitations(results) {
    return results.map(result => {
      // 確保有標題
      const title = result.title || 
                    result.data?.title || 
                    result.metadata?.title || 
                    'Untitled';
      
      return {
        ...result,
        title, // 明確設置標題
        citation: {
          source: result._source || result.source || 'json-rag',
          documentId: result.id,
          timestamp: result.updated_at || result.created_at || Date.now(),
          checksum: result.checksum || null,
          location: {
            collection: result.collection,
            offset: result.offset || 0,
            length: result.length || 0
          }
        }
      };
    });
  }


}