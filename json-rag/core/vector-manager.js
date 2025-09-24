// core/vector-manager.js

import LocalEmbedder from '../embedders/local-embedder.js';

/**
 * 向量管理器
 * 協調LocalEmbedder和向量索引，管理向量生命週期
 */
class VectorManager {
  /**
   * 構造函數
   * @param {Object} config - 配置對象
   */
  constructor(config = {}) {
    // 使用依賴注入而非直接創建實例
    this.embedder = config.embedder || null;
    this.indexAdapter = config.indexAdapter || null;
    this.config = {
      chunkSize: config.chunkSize || 512,
      chunkOverlap: config.chunkOverlap || 128,
      ...config
    };
    
    if (!this.embedder) {
      throw new Error('Embedder instance is required');
    }
    if (!this.indexAdapter) {
      throw new Error('IndexAdapter instance is required');
    }
  }

  /**
   * 初始化向量管理器
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log('初始化向量管理器...');
    
    // 初始化嵌入器
    if (!this.embedder.isReady()) {
      await this.embedder.initialize({ prewarm: true });
    }
    
    // 初始化索引適配器（如果提供）
    if (this.indexAdapter && typeof this.indexAdapter.initialize === 'function') {
      await this.indexAdapter.initialize();
    }
    
    console.log('向量管理器初始化完成');
  }

  /**
   * 判斷是否需要創建向量
   * @param {Object} document - 文檔對象
   * @returns {Promise<boolean>}
   */
  async shouldCreateEmbedding(document) {
    // 檢查文檔類型
    if (this.skipTypes.includes(document.type)) {
      return false;
    }
    
    // 提取內容
    const content = this.extractContent(document);
    
    // 長度檢查
    if (content.length < this.minLengthForEmbedding) {
      return false;
    }
    
    // 檢查是否已存在向量
    if (this.vectorMetadata.has(document.id)) {
      const metadata = this.vectorMetadata.get(document.id);
      const contentHash = this.hashContent(content);
      
      // 如果內容未變化，無需重新生成
      if (metadata.contentHash === contentHash) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 為文檔創建向量
   * @param {Object} document - 文檔對象
   * @param {Object} options - 選項
   * @returns {Promise<void>}
   */
  async createEmbedding(document, options = {}) {
    const content = this.extractContent(document);
    
    // 檢查是否需要創建向量
    if (!options.force && !await this.shouldCreateEmbedding(document)) {
      return;
    }
    
    try {
      // 計算內容哈希
      const contentHash = this.hashContent(content);
      
      // 檢查緩存
      let vector;
      if (this.embeddingCache.has(contentHash)) {
        vector = this.embeddingCache.get(contentHash);
        console.log(`使用緩存向量: ${document.id}`);
      } else {
        // 生成新向量
        vector = await this.embedder.embed(content);
        this.embeddingCache.set(contentHash, vector);
        console.log(`生成新向量: ${document.id}`);
      }
      
      // 保存向量到索引
      if (this.indexAdapter) {
        await this.indexAdapter.upsertEmbedding(document.id, vector, {
          content: content.substring(0, 500), // 保存前500字符作為預覽
          type: document.type,
          contentHash: contentHash,
          createdAt: Date.now()
        });
      }
      
      // 更新元數據
      this.vectorMetadata.set(document.id, {
        contentHash: contentHash,
        vectorDim: vector.length,
        createdAt: Date.now(),
        modelName: this.embedder.modelName
      });
      
    } catch (error) {
      console.error(`創建向量失敗 ${document.id}:`, error.message);
      throw error;
    }
  }

  /**
   * 批量創建向量
   * @param {Array<Object>} documents - 文檔數組
   * @param {Object} options - 批處理選項
   * @returns {Promise<void>}
   */
  async createEmbeddings(documents, options = {}) {
    const onProgress = options.onProgress || (() => {});
    
    // 過濾需要處理的文檔
    const toProcess = [];
    for (const doc of documents) {
      if (await this.shouldCreateEmbedding(doc)) {
        toProcess.push(doc);
      }
    }
    
    if (toProcess.length === 0) {
      console.log('沒有需要創建向量的文檔');
      return;
    }
    
    console.log(`批量創建向量: ${toProcess.length} 個文檔`);
    
    // 提取內容
    const contents = toProcess.map(doc => this.extractContent(doc));
    
    // 批量生成向量
    const vectors = await this.embedder.embedBatch(contents, {
      ...options,
      onProgress: (processed, total) => {
        console.log(`向量生成進度: ${processed}/${total}`);
        onProgress(processed, total);
      }
    });
    
    // 保存向量到索引
    for (let i = 0; i < toProcess.length; i++) {
      const doc = toProcess[i];
      const vector = vectors[i];
      const content = contents[i];
      const contentHash = this.hashContent(content);
      
      if (this.indexAdapter) {
        await this.indexAdapter.upsertEmbedding(doc.id, vector, {
          content: content.substring(0, 500),
          type: doc.type,
          contentHash: contentHash,
          createdAt: Date.now()
        });
      }
      
      // 更新元數據
      this.vectorMetadata.set(doc.id, {
        contentHash: contentHash,
        vectorDim: vector.length,
        createdAt: Date.now(),
        modelName: this.embedder.modelName
      });
      
      // 更新緩存
      this.embeddingCache.set(contentHash, vector);
    }
    
    console.log('批量向量創建完成');
  }

  /**
   * 搜索相似文檔
   * @param {string} query - 查詢文本
   * @param {number} k - 返回數量
   * @param {Object} options - 搜索選項
   * @returns {Promise<Array>}
   */
  async searchSimilar(query, k = 10, options = {}) {
    if (!this.embedder.isReady()) {
      await this.embedder.initialize();
    }
    
    // 生成查詢向量
    const queryVector = await this.embedder.embed(query);
    
    // 使用索引適配器搜索
    if (this.indexAdapter && typeof this.indexAdapter.searchSimilar === 'function') {
      const results = await this.indexAdapter.searchSimilar(queryVector, k, {
        ...options,
        fetchMetadata: true
      });
      
      return results;
    }
    
    // 如果沒有索引，進行簡單的線性搜索（僅用於測試）
    console.warn('沒有向量索引，使用線性搜索（性能較差）');
    return this.linearSearch(queryVector, k);
  }

  /**
   * 線性搜索（備用方法）
   * @private
   */
  async linearSearch(queryVector, k) {
    const results = [];
    
    // 遍歷所有已知的文檔向量
    for (const [docId, metadata] of this.vectorMetadata) {
      // 嘗試從索引獲取向量
      if (this.indexAdapter && typeof this.indexAdapter.getEmbedding === 'function') {
        const docVector = await this.indexAdapter.getEmbedding(docId);
        if (docVector) {
          const similarity = LocalEmbedder.cosineSimilarity(queryVector, docVector);
          results.push({
            docId: docId,
            score: similarity,
            metadata: metadata
          });
        }
      }
    }
    
    // 排序並返回前k個結果
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * 更新文檔向量
   * @param {string} docId - 文檔ID
   * @param {string} newContent - 新內容
   * @returns {Promise<void>}
   */
  async updateDocumentEmbedding(docId, newContent) {
    const contentHash = this.hashContent(newContent);
    
    // 生成新向量
    const vector = await this.embedder.embed(newContent);
    
    // 更新索引
    if (this.indexAdapter) {
      await this.indexAdapter.upsertEmbedding(docId, vector, {
        content: newContent.substring(0, 500),
        contentHash: contentHash,
        updatedAt: Date.now()
      });
    }
    
    // 更新元數據
    this.vectorMetadata.set(docId, {
      contentHash: contentHash,
      vectorDim: vector.length,
      updatedAt: Date.now(),
      modelName: this.embedder.modelName
    });
    
    // 更新緩存
    this.embeddingCache.set(contentHash, vector);
  }

  /**
   * 重建所有向量
   * @param {string} modelName - 使用的模型（可選）
   * @returns {Promise<void>}
   */
  async rebuildAllEmbeddings(modelName) {
    console.log('開始重建所有向量...');
    
    // 如果指定新模型，重新初始化嵌入器
    if (modelName && modelName !== this.embedder.modelName) {
      await this.embedder.dispose();
      this.embedder = new LocalEmbedder({ modelName });
      await this.embedder.initialize();
    }
    
    // 清空緩存
    this.embeddingCache.clear();
    
    // 獲取所有文檔ID
    const docIds = Array.from(this.vectorMetadata.keys());
    
    console.log(`需要重建 ${docIds.length} 個文檔的向量`);
    
    // TODO: 批量重建向量
    // 這裡需要訪問原始文檔數據，可能需要storage適配器的支援
    
    console.log('向量重建完成');
  }
  
  /**
   * 提取文檔內容
   * @private
   * @param {Object} document - 文檔對象
   * @returns {string} 文本內容
   */
  extractContent(document) {
    let content = '';
    
    // 優先使用 content 字段
    if (document.content) {
      content = document.content;
    }
    // 然後嘗試 text 字段
    else if (document.text) {
      content = document.text;
    }
    // 如果有 data 對象，提取其中的文本
    else if (document.data) {
      if (typeof document.data === 'string') {
        content = document.data;
      } else if (typeof document.data === 'object') {
        // 組合多個字段
        const textFields = ['title', 'description', 'content', 'text', 'body', 'summary'];
        for (const field of textFields) {
          if (document.data[field]) {
            content += (content ? ' ' : '') + document.data[field];
          }
        }
      }
    }
    
    // 如果仍然沒有內容，嘗試序列化整個文檔
    if (!content) {
      content = JSON.stringify(document);
    }
    
    return content.trim();
  }
  
  /**
   * 計算內容哈希
   * @private
   */
  hashContent(content) {
    // 簡單的字符串哈希函數
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * 獲取統計信息
   * @returns {Promise<Object>}
   */
  async getStats() {
    const stats = {
      embedderModel: this.embedder.modelName,
      embedderInitialized: this.embedder.isReady(),
      vectorDimension: this.embedder.getDimension(),
      totalDocuments: this.vectorMetadata.size,
      cacheSize: this.embeddingCache.size,
      queueLength: this.embeddingQueue.length,
      isProcessing: this.isProcessing
    };
    
    // 如果有索引適配器，獲取其統計信息
    if (this.indexAdapter && typeof this.indexAdapter.getStats === 'function') {
      const indexStats = await this.indexAdapter.getStats();
      stats.indexStats = indexStats;
    }
    
    return stats;
  }

  /**
   * 清理資源
   * @returns {Promise<void>}
   */
  async dispose() {
    // 清理嵌入器
    if (this.embedder) {
      await this.embedder.dispose();
    }
    
    // 清理索引適配器
    if (this.indexAdapter && typeof this.indexAdapter.dispose === 'function') {
      await this.indexAdapter.dispose();
    }
    
    // 清理緩存
    this.embeddingCache.clear();
    this.vectorMetadata.clear();
    this.embeddingQueue = [];
    
    console.log('VectorManager 資源已清理');
  }


  /**
   * 分塊內容
   * @param {string} content - 要分塊的內容
   * @param {object} config - 分塊配置
   * @returns {Array} 分塊數組
   */
  chunkContent(content, config = {}) {
    const size = config.size || this.config.chunkSize || 512;
    const overlap = config.overlap || this.config.chunkOverlap || 128;
    const chunks = [];
    
    for (let i = 0; i < content.length; i += size - overlap) {
      const chunk = {
        text: content.substring(i, Math.min(i + size, content.length)),
        offset: i,
        length: Math.min(size, content.length - i)
      };
      chunks.push(chunk);
      
      // 如果已經到達末尾，停止
      if (i + size >= content.length) break;
    }
    
    return chunks;
  }
}

// 導出定義
export default VectorManager;
