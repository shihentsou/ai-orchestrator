// core/query-engine-enhanced.js

/**
 * JSON-RAG v5.2.1 增強查詢引擎
 * 支援向量搜尋的完整實現
 */

import VectorManager from './vector-manager.js';
import LocalEmbedder from '../embedders/local-embedder.js';

export class QueryEngine {
  constructor(adapters) {
    this.scannedCount = 0;
    this.adapters = adapters;
    
    // 向量管理器（可選）
    this.vectorManager = null;
    this.queryVectorCache = new Map(); // 查詢向量緩存
    
    this.strategies = {
      'filter-first': this.filterFirstStrategy.bind(this),
      'semantic-first': this.semanticFirstStrategy.bind(this),
      'parallel': this.parallelStrategy.bind(this)
    };
  }

  /**
   * 初始化向量支援
   */
  async initializeVectorSupport(config = {}) {
    if (!this.adapters.vector) {
      console.log('未提供向量索引適配器，跳過向量支援初始化');
      return;
    }
    
    // 創建向量管理器
    this.vectorManager = new VectorManager({
      indexAdapter: this.adapters.vector,
      ...config
    });
    
    await this.vectorManager.initialize();
    console.log('向量支援已初始化');
  }

  /**
   * 執行搜索（主入口）
   */
  async search(request) {
    const startTime = Date.now();
    const strategy = request.hybrid || 'filter-first';
    
    let results;
    
    try {
      // 如果請求向量搜尋但沒有向量支援，降級處理
      if (request.semantic?.useEmbedding && !this.vectorManager) {
        console.warn('請求向量搜尋但未初始化向量支援，降級到FTS搜尋');
        request = {
          ...request,
          semantic: {
            ...request.semantic,
            useEmbedding: false
          }
        };
      }
      
      // 選擇策略
      const strategyFn = this.strategies[strategy];
      if (!strategyFn) {
        // 默認策略
        results = await this.structuralOnly(request);
      } else {
        results = await strategyFn(request);
      }
      
    } catch (error) {
      // 錯誤處理與降級
      if (error.code === 'VECTOR_INIT_ERROR' || error.code === 'MODEL_DOWNLOAD_ERROR') {
        console.warn('向量搜尋失敗，降級到FTS+結構化查詢:', error.message);
        results = await this.fallbackSearch(request);
      } else {
        throw error;
      }
    }
    
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
        cacheHit: false,
        vectorSearchUsed: request.semantic?.useEmbedding && this.vectorManager !== null
      }
    };
    
    return response;
  }

  /**
   * 純結構化查詢（包括 FTS）
   */
  async structuralOnly(request) {
    // 如果有語義查詢但不使用向量，使用 FTS
    if (request.semantic?.query && !request.semantic.useEmbedding) {
      const fts = this.adapters?.fts ?? this.adapters?.index?.fulltext;
      
      if (fts && typeof fts.searchFTS === 'function') {
        console.log('[QueryEngine] Using FTS adapter');
        const ftsResults = await fts.searchFTS(request.semantic.query, {
          limit: request.semantic.limit || 100,
          collection: request.structural?.collection
        });
        
        // 如果有結構化過濾，應用過濾
        if (request.structural) {
          return this.applyStructuralFilters(ftsResults, request.structural);
        }
        
        return await this.hydrateFTSResults(ftsResults);
      }
    }
    
    // 否則執行純結構化查詢
    return this.structuralFilter(request.structural || {});
  }

  /**
   * 策略1：先過濾後語義（推薦）
   */
  async filterFirstStrategy(request) {
    // Step 1: 結構化過濾
    let candidates;
    
    if (request.structural && Object.keys(request.structural).length > 0) {
      candidates = await this.structuralFilter(request.structural);
    } else if (request.semantic && !request.semantic.useEmbedding) {
      // 純 FTS 查詢
      return await this.structuralOnly(request);
    } else {
      // 獲取所有文檔
      candidates = await this.getAllDocuments();
    }
    
    // Step 2: 語義增強（如果需要）
    if (request.semantic?.useEmbedding && this.vectorManager && candidates.length > 0) {
      const queryVector = await this.getQueryEmbedding(request.semantic.query);
      candidates = await this.semanticRerank(candidates, queryVector, request.semantic);
    }
    
    return candidates;
  }

  /**
   * 策略2：先語義後過濾
   */
  async semanticFirstStrategy(request) {
    if (!request.semantic?.useEmbedding || !this.vectorManager) {
      // 沒有向量搜尋需求，轉到 filter-first 策略
      return this.filterFirstStrategy(request);
    }
    
    // Step 1: 語義搜尋
    const semanticResults = await this.performSemanticSearch(request.semantic);
    
    // Step 2: 結構化過濾（如果有）
    if (request.structural && Object.keys(request.structural).length > 0) {
      return this.applyStructuralFilters(semanticResults, request.structural);
    }
    
    return semanticResults;
  }

  /**
   * 策略3：並行查詢後融合
   */
  async parallelStrategy(request) {
    const promises = [];
    const resultSets = {};
    
    // 結構化查詢
    if (request.structural && Object.keys(request.structural).length > 0) {
      promises.push(
        this.structuralFilter(request.structural)
          .then(r => { resultSets.structural = r; })
      );
    }
    
    // FTS查詢
    if (request.semantic?.query && !request.semantic.useEmbedding) {
      const fts = this.adapters?.fts;
      if (fts) {
        promises.push(
          fts.searchFTS(request.semantic.query, { limit: 100 })
            .then(r => this.hydrateFTSResults(r))
            .then(r => { resultSets.fts = r; })
        );
      }
    }
    
    // 向量查詢
    if (request.semantic?.useEmbedding && this.vectorManager) {
      promises.push(
        this.performSemanticSearch(request.semantic)
          .then(r => { resultSets.semantic = r; })
      );
    }
    
    // 等待所有查詢完成
    await Promise.all(promises);
    
    // 融合結果
    return this.fuseResults(resultSets, request.hybrid);
  }

  /**
   * 執行語義搜尋
   */
  async performSemanticSearch(semanticQuery) {
    if (!this.vectorManager) {
      console.warn('向量管理器未初始化');
      return [];
    }
    
    console.log('[QueryEngine] 執行向量搜尋:', semanticQuery.query);
    
    // 搜尋相似向量
    const vectorResults = await this.vectorManager.searchSimilar(
      semanticQuery.query,
      semanticQuery.k || 10,
      {
        threshold: semanticQuery.threshold || 0.5
      }
    );
    
    // 補充完整文檔數據
    return this.hydrateVectorResults(vectorResults);
  }

  /**
   * 獲取查詢向量
   */
  async getQueryEmbedding(query) {
    // 檢查緩存
    if (this.queryVectorCache.has(query)) {
      return this.queryVectorCache.get(query);
    }
    
    // 生成新向量
    if (!this.vectorManager || !this.vectorManager.embedder) {
      throw new Error('向量管理器未初始化');
    }
    
    const vector = await this.vectorManager.embedder.embed(query);
    
    // 緩存向量（LRU策略，保持最多100個）
    if (this.queryVectorCache.size > 100) {
      const firstKey = this.queryVectorCache.keys().next().value;
      this.queryVectorCache.delete(firstKey);
    }
    this.queryVectorCache.set(query, vector);
    
    return vector;
  }

  /**
   * 語義重排序
   */
  async semanticRerank(candidates, queryVector, semanticQuery) {
    if (!this.vectorManager) return candidates;
    
    console.log('[QueryEngine] 對', candidates.length, '個候選進行語義重排序');
    
    // 為每個候選文檔計算語義分數
    const scoredCandidates = [];
    
    for (const doc of candidates) {
      // 檢查是否有向量
      const hasVector = await this.vectorManager.indexAdapter.hasEmbedding(doc.id);
      
      if (!hasVector) {
        // 如果沒有向量，嘗試創建
        await this.vectorManager.createEmbedding(doc);
      }
      
      // 獲取向量
      const docVector = await this.vectorManager.indexAdapter.getEmbedding(doc.id);
      
      if (docVector) {
        const similarity = LocalEmbedder.cosineSimilarity(queryVector, docVector);
        scoredCandidates.push({
          ...doc,
          semanticScore: similarity
        });
      } else {
        // 沒有向量的文檔給予低分
        scoredCandidates.push({
          ...doc,
          semanticScore: 0
        });
      }
    }
    
    // 按語義分數排序
    scoredCandidates.sort((a, b) => b.semanticScore - a.semanticScore);
    
    // 過濾低於閾值的結果
    const threshold = semanticQuery.threshold || 0.5;
    return scoredCandidates.filter(doc => doc.semanticScore >= threshold);
  }

  /**
   * 融合多源結果
   */
  fuseResults(resultSets, hybridConfig = {}) {
    const weights = {
      structural: hybridConfig.structuralWeight || 0.3,
      fts: hybridConfig.ftsWeight || 0.3,
      semantic: hybridConfig.semanticWeight || 0.4
    };
    
    const fusedMap = new Map();
    
    // 處理每個來源的結果
    for (const [source, results] of Object.entries(resultSets)) {
      if (!results) continue;
      
      const weight = weights[source] || 0.33;
      
      results.forEach((doc, index) => {
        const id = doc.id;
        const score = weight * (1 - index / results.length); // 位置衰減
        
        if (fusedMap.has(id)) {
          const existing = fusedMap.get(id);
          existing.fusedScore += score;
          existing.sources.push(source);
        } else {
          fusedMap.set(id, {
            ...doc,
            fusedScore: score,
            sources: [source]
          });
        }
      });
    }
    
    // 轉換為數組並排序
    return Array.from(fusedMap.values())
      .sort((a, b) => b.fusedScore - a.fusedScore);
  }

  /**
   * 補充向量搜尋結果的完整數據
   */
  async hydrateVectorResults(vectorResults) {
    if (!this.adapters.storage) {
      return vectorResults;
    }
    
    const hydrated = [];
    
    for (const result of vectorResults) {
      try {
        const doc = await this.adapters.storage.get(result.docId);
        if (doc) {
          hydrated.push({
            ...doc,
            id: result.docId,
            score: result.score,
            vectorMetadata: result.metadata
          });
        }
      } catch (error) {
        console.warn(`無法獲取文檔 ${result.docId}:`, error.message);
      }
    }
    
    return hydrated;
  }

  /**
   * 補充FTS結果的完整數據
   */
  async hydrateFTSResults(ftsResults) {
    if (!this.adapters.storage) {
      return ftsResults;
    }
    
    const hydrated = [];
    const seenIds = new Set();
    
    for (const result of ftsResults) {
      // 去重檢查
      const docId = result.doc_id || result.id;
      if (seenIds.has(docId)) continue;
      seenIds.add(docId);
      
      try {
        const doc = await this.adapters.storage.get(docId);
        if (doc) {
          hydrated.push({
            ...doc,
            id: docId,
            score: result.score || 1.0,
            highlights: result.highlights
          });
        }
      } catch (error) {
        console.warn(`無法獲取文檔 ${docId}:`, error.message);
      }
    }
    
    return hydrated;
  }

  /**
   * 降級搜尋（向量層不可用時）
   */
  async fallbackSearch(request) {
    console.log('[QueryEngine] 使用降級搜尋策略');
    
    const results = [];
    
    // 使用 FTS
    if (request.semantic?.query) {
      const fts = this.adapters?.fts;
      if (fts) {
        const ftsResults = await fts.searchFTS(request.semantic.query, {
          limit: 100
        });
        const hydrated = await this.hydrateFTSResults(ftsResults);
        results.push(...hydrated);
      }
    }
    
    // 使用結構化查詢
    if (request.structural) {
      const structResults = await this.structuralFilter(request.structural);
      
      // 合併結果（去重）
      const existingIds = new Set(results.map(r => r.id));
      for (const doc of structResults) {
        if (!existingIds.has(doc.id)) {
          results.push(doc);
        }
      }
    }
    
    return results;
  }

  /**
   * 結構化過濾
   */
  async structuralFilter(criteria) {
    if (!this.adapters.storage) {
      return [];
    }
    
    // 簡單實現：獲取所有文檔並過濾
    // TODO: 優化為索引查詢
    const allDocs = await this.getAllDocuments();
    
    return allDocs.filter(doc => {
      if (criteria.collection && doc.collection !== criteria.collection) {
        return false;
      }
      
      if (criteria.type && doc.type !== criteria.type) {
        return false;
      }
      
      if (criteria.tags && Array.isArray(criteria.tags)) {
        if (!doc.tags || !criteria.tags.every(tag => doc.tags.includes(tag))) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 應用結構化過濾器
   */
  applyStructuralFilters(documents, criteria) {
    return documents.filter(doc => {
      if (criteria.collection && doc.collection !== criteria.collection) {
        return false;
      }
      
      if (criteria.type && doc.type !== criteria.type) {
        return false;
      }
      
      if (criteria.tags && Array.isArray(criteria.tags)) {
        if (!doc.tags || !criteria.tags.every(tag => doc.tags.includes(tag))) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 獲取所有文檔
   */
  async getAllDocuments() {
    if (!this.adapters.storage) {
      return [];
    }
    
    // TODO: 實現分頁
    const docs = [];
    const collections = await this.adapters.storage.listCollections();
    
    for (const collection of collections) {
      const keys = await this.adapters.storage.list(collection);
      for (const key of keys) {
        const doc = await this.adapters.storage.get(key);
        if (doc) {
          docs.push({
            ...doc,
            id: key,
            collection
          });
        }
      }
    }
    
    return docs;
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
        timestamp: result.updated_at || Date.now(),
        collection: result.collection
      }
    }));
  }

  /**
   * 獲取掃描計數
   */
  getScannedCount() {
    return this.scannedCount;
  }

  /**
   * 混合搜尋（公開API）
   */
  async hybridSearch(request) {
    return this.search({
      ...request,
      hybrid: request.hybrid || 'filter-first'
    });
  }
}

// 導出定義
export default QueryEngine;
