/**
 * 內存索引適配器
 * 支援結構化索引、全文索引和向量索引的基本實現
 */

import { IndexPort } from '../../core/interfaces.js';

export class MemoryIndexAdapter extends IndexPort {
  constructor(init) {
    super();
    // 支持兩種建構方式
    this.storage = init.deps?.storage || init.storage || init;
    this.logger = init.logger || console;
    
    // 結構化索引
    this.indexes = new Map(); // field -> Map(value -> Set(docIds))
    
    // 全文索引
    this.ftsIndex = new Map(); // word -> Map(docId -> score)
    this.docTexts = new Map(); // docId -> text
    
    // 向量索引
    this.vectors = new Map(); // docId -> Float32Array
    this.vectorMetadata = new Map(); // docId -> metadata
  }

  /**
   * 初始化適配器
   */
  async initialize() {
    console.log('[MemoryIndex] 初始化完成');
  }

  // ========== 統一接口方法 ==========

  /**
   * 添加文檔到索引（統一接口）
   */
  async addDocument(documentId, document) {
    // 索引基本字段
    const basicFields = ['id', 'collection', 'type', 'created_at', 'updated_at'];
    for (const field of basicFields) {
      if (document[field] !== undefined) {
        await this.addToIndex(field, document[field], documentId);
      }
    }
    
    // 索引 data 中的字段
    if (document.data && typeof document.data === 'object') {
      await this.indexObject(document.data, 'data', documentId);
    }
    
    // 索引 metadata 中的字段
    if (document.metadata && typeof document.metadata === 'object') {
      await this.indexObject(document.metadata, 'metadata', documentId);
    }
  }

  /**
   * 從索引中移除文檔（統一接口）
   */
  async removeDocument(documentId) {
    await this.removeFromIndex(documentId);
    await this.removeFromFTS(documentId);
    await this.removeEmbedding(documentId);
  }

  /**
   * 遞歸索引對象
   */
  async indexObject(obj, prefix, documentId, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        // 處理數組
        if (value.length > 0 && typeof value[0] !== 'object') {
          // 簡單數組，存儲為逗號分隔的字符串
          await this.addToIndex(fieldName, value.join(','), documentId);
        }
      } else if (typeof value === 'object') {
        // 遞歸處理嵌套對象
        await this.indexObject(value, fieldName, documentId, maxDepth, currentDepth + 1);
      } else {
        // 基本類型
        await this.addToIndex(fieldName, String(value), documentId);
      }
    }
  }

  /**
   * 獲取索引字段（用於測試）
   */
  async getIndexedFields(documentId) {
    const fields = [];
    
    for (const [fieldName, index] of this.indexes.entries()) {
      for (const [value, docIds] of index.entries()) {
        if (docIds.has(documentId)) {
          fields.push({
            name: fieldName,
            value: value,
            type: typeof value
          });
        }
      }
    }
    
    return fields;
  }

  /**
   * 重建索引
   */
  async rebuild(getAllDocuments) {
    this.logger.log('[MemoryIndexAdapter] Starting index rebuild...');
    const startTime = Date.now();
    
    // 清空索引
    await this.clear();
    
    // 獲取所有文檔並重新索引
    const documents = await getAllDocuments();
    let count = 0;
    
    for (const doc of documents) {
      await this.addDocument(doc.id, doc);
      count++;
      
      if (count % 1000 === 0) {
        this.logger.log(`[MemoryIndexAdapter] Indexed ${count} documents...`);
      }
    }
    
    const elapsed = Date.now() - startTime;
    this.logger.log(`[MemoryIndexAdapter] Rebuild completed: ${count} documents in ${elapsed}ms`);
    
    return { count, elapsed };
  }

  /**
   * 查詢（簡單 AND 查詢）
   */
  async query(criteria) {
    let results = null;
    
    for (const [field, value] of Object.entries(criteria)) {
      const fieldResults = await this.findByIndex(field, value);
      
      if (results === null) {
        results = new Set(fieldResults);
      } else {
        // 交集
        results = new Set(fieldResults.filter(id => results.has(id)));
      }
      
      // 如果結果為空，提前返回
      if (results.size === 0) {
        return [];
      }
    }
    
    return results ? Array.from(results) : [];
  }

  // ========== 結構化索引 ==========

  /**
   * 創建索引
   */
  async createIndex(field, options = {}) {
    if (!this.indexes.has(field)) {
      this.indexes.set(field, new Map());
      console.log(`[MemoryIndex] 創建索引: ${field}`);
    }
  }

  /**
   * 通過索引查找
   */
  async findByIndex(field, value) {
    const index = this.indexes.get(field);
    if (!index) {
      return [];
    }

    const docIds = index.get(value);
    return docIds ? Array.from(docIds) : [];
  }

  /**
   * 添加到結構化索引
   */
  async addToIndex(field, value, docId) {
    // 確保索引存在
    if (!this.indexes.has(field)) {
      await this.createIndex(field);
    }

    const index = this.indexes.get(field);
    
    // 獲取或創建文檔集合
    if (!index.has(value)) {
      index.set(value, new Set());
    }
    
    index.get(value).add(docId);
  }

  /**
   * 從結構化索引移除
   */
  async removeFromIndex(docId) {
    // 從所有索引中移除
    for (const [field, index] of this.indexes.entries()) {
      for (const [value, docIds] of index.entries()) {
        docIds.delete(docId);
        
        // 如果集合為空，刪除該值
        if (docIds.size === 0) {
          index.delete(value);
        }
      }
    }
  }

  /**
   * 範圍查詢
   */
  async findByRange(field, start, end) {
    const index = this.indexes.get(field);
    if (!index) {
      return [];
    }

    const results = new Set();
    
    for (const [value, docIds] of index.entries()) {
      if (value >= start && value <= end) {
        docIds.forEach(id => results.add(id));
      }
    }

    return Array.from(results);
  }

  // ========== 全文索引 ==========

  /**
   * 添加到全文搜索
   */
  async addToFTS(docId, content) {
    if (!content || typeof content !== 'string') {
      return;
    }

    // 存儲原始文本
    this.docTexts.set(docId, content);

    // 分詞
    const words = this.tokenize(content);
    
    // 計算詞頻
    const wordFreq = new Map();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // 更新倒排索引
    for (const [word, freq] of wordFreq.entries()) {
      if (!this.ftsIndex.has(word)) {
        this.ftsIndex.set(word, new Map());
      }
      
      // 簡單的TF分數
      const score = freq / words.length;
      this.ftsIndex.get(word).set(docId, score);
    }
  }

  /**
   * 全文搜索
   */
  async searchFTS(query, options = {}) {
    const queryWords = this.tokenize(query.toLowerCase());
    const scores = new Map();

    // 計算每個文檔的分數
    for (const word of queryWords) {
      const postings = this.ftsIndex.get(word);
      if (postings) {
        for (const [docId, score] of postings.entries()) {
          scores.set(docId, (scores.get(docId) || 0) + score);
        }
      }
    }

    // 排序結果
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, options.limit || 100)
      .map(([docId, score]) => ({
        id: docId,
        score,
        highlight: options.highlight ? this.generateHighlight(docId, queryWords) : null
      }));

    return results;
  }

  /**
   * 從全文索引移除
   */
  async removeFromFTS(docId) {
    // 移除文本
    this.docTexts.delete(docId);

    // 從倒排索引移除
    for (const [word, postings] of this.ftsIndex.entries()) {
      postings.delete(docId);
      
      // 如果沒有文檔包含該詞，刪除該詞
      if (postings.size === 0) {
        this.ftsIndex.delete(word);
      }
    }
  }

  /**
   * 分詞
   */
  tokenize(text) {
    // 簡單的分詞實現
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中文字符
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  /**
   * 生成高亮
   */
  generateHighlight(docId, queryWords) {
    const text = this.docTexts.get(docId);
    if (!text) return null;

    // 簡單的高亮實現
    let highlighted = text;
    for (const word of queryWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      highlighted = highlighted.replace(regex, `<mark>${word}</mark>`);
    }

    // 提取包含查詢詞的片段
    const firstMatch = queryWords
      .map(word => highlighted.toLowerCase().indexOf(word.toLowerCase()))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0];

    if (firstMatch >= 0) {
      const start = Math.max(0, firstMatch - 50);
      const end = Math.min(highlighted.length, firstMatch + 150);
      return '...' + highlighted.substring(start, end) + '...';
    }

    return highlighted.substring(0, 200) + '...';
  }

  // ========== 向量索引 ==========

  /**
   * 添加向量嵌入
   */
  async addEmbedding(docId, vector) {
    if (!(vector instanceof Float32Array)) {
      throw new Error('向量必須是 Float32Array 類型');
    }

    this.vectors.set(docId, vector);
    this.vectorMetadata.set(docId, {
      dimension: vector.length,
      created_at: Date.now()
    });
  }

  /**
   * 獲取向量
   */
  async getEmbedding(docId) {
    return this.vectors.get(docId) || null;
  }

  /**
   * 相似性搜索
   */
  async searchSimilar(queryVector, k = 10) {
    if (!(queryVector instanceof Float32Array)) {
      throw new Error('查詢向量必須是 Float32Array 類型');
    }

    const scores = [];

    // 計算與所有向量的相似度
    for (const [docId, vector] of this.vectors.entries()) {
      if (vector.length !== queryVector.length) {
        continue; // 跳過維度不匹配的向量
      }

      const similarity = this.cosineSimilarity(queryVector, vector);
      scores.push({ id: docId, score: similarity });
    }

    // 排序並返回前k個
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, k);
  }

  /**
   * 移除向量
   */
  async removeEmbedding(docId) {
    this.vectors.delete(docId);
    this.vectorMetadata.delete(docId);
  }

  /**
   * 重建向量索引
   */
  async rebuildEmbeddings(model) {
    console.log(`[MemoryIndex] 重建向量索引請求，模型: ${model}`);
    // 在內存實現中，這個方法主要用於清理
    
    // 可以選擇清空現有向量
    if (model && model !== 'keep-existing') {
      this.vectors.clear();
      this.vectorMetadata.clear();
    }
  }

  /**
   * 計算餘弦相似度
   */
  cosineSimilarity(a, b) {
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

  // ========== 工具方法 ==========

  /**
   * 獲取索引統計
   */
  async getStats() {
    return {
      structural: {
        indexCount: this.indexes.size,
        totalEntries: Array.from(this.indexes.values())
          .reduce((sum, index) => sum + index.size, 0)
      },
      fulltext: {
        vocabularySize: this.ftsIndex.size,
        documentCount: this.docTexts.size
      },
      vector: {
        vectorCount: this.vectors.size,
        dimensions: this.vectors.size > 0 
          ? this.vectors.values().next().value.length 
          : 0
      }
    };
  }

  /**
   * 清空所有索引
   */
  async clear() {
    this.indexes.clear();
    this.ftsIndex.clear();
    this.docTexts.clear();
    this.vectors.clear();
    this.vectorMetadata.clear();
  }

  /**
   * 關閉適配器
   */
  async close() {
    // 內存索引無需關閉
    console.log('[MemoryIndex] 已關閉');
  }

  // ========== 契約相容性補丁 MEMORY-DISPOSE ==========

  /**
   * 釋放資源（契約要求的方法）
   */
  async dispose() {
    // 清空內存索引
    this.documents.clear();
    this.index.clear();
    this.embeddings.clear();
    if (this.miniSearch) {
      this.miniSearch = null;
    }
  }

  
  /**
   * 插入或更新向量（Memory適配器不支援向量）
   * @param {string} docId - 文檔ID
   * @param {Float32Array} vector - 向量數據
   * @param {Object} metadata - 元數據
   */
  async upsertEmbedding(docId, vector, metadata = {}) {
    console.warn('[Memory] upsertEmbedding called but not supported - Memory adapter is for full-text only');
    // Memory適配器是純全文搜索，不支援向量操作
    // 為了契約合規性，提供空實現
  }
  
  /**
   * 檢查是否有向量（Memory適配器不支援向量）
   * @param {string} docId - 文檔ID
   * @returns {boolean} 總是返回false
   */
  async hasEmbedding(docId) {
    // Memory適配器不支援向量存儲
    return false;
  }
  
  /**
   * 刪除向量（Memory適配器不支援向量）
   * @param {string} docId - 文檔ID
   */
  async deleteEmbedding(docId) {
    console.warn('[Memory] deleteEmbedding called but not supported - Memory adapter is for full-text only');
    // Memory適配器是純全文搜索，不支援向量操作
    // 為了契約合規性，提供空實現
  }

}