// embedders/local-embedder.js

/**
 * 本地向量嵌入器
 * 使用 @xenova/transformers 生成文本向量
 */
class LocalEmbedder {
  /**
   * 構造函數
   * @param {Object} config - 配置對象
   */
  constructor(config = {}) {
    this.modelName = config.modelName || 'Xenova/all-MiniLM-L6-v2';
    this.cachePath = config.cachePath || './models';
    this.maxLength = config.maxLength || 512;
    this.normalize = config.normalize !== false;
    this.pooling = config.pooling || 'mean';
    this.device = config.device || 'cpu';
    this.model = null;
    this.tokenizer = null;
    this.initialized = false;
    this.dimensions = 384; // all-MiniLM-L6-v2 的固定維度
    this.pipeline = null;
  }

  /**
   * 初始化嵌入器
   * @param {Object} options - 初始化選項
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    if (this.initialized) return;
    
    try {
      // 動態導入 @xenova/transformers
      const { pipeline, env } = await import('@xenova/transformers');
      
      // 設置緩存路徑
      env.cacheDir = this.cachePath;
      env.allowRemoteModels = true;
      
      // 創建 feature-extraction pipeline
      console.log('正在載入嵌入模型:', this.modelName);
      this.pipeline = await pipeline('feature-extraction', this.modelName, {
        quantized: true // 使用量化模型以節省記憶體
      });
      
      this.initialized = true;
      console.log('嵌入模型載入完成');
      
      // 預熱模型
      if (options.prewarm) {
        await this.warmup();
      }
    } catch (error) {
      throw new Error(`初始化 LocalEmbedder 失敗: ${error.message}`);
    }
  }
  
  /**
   * 預熱模型
   * @returns {Promise<void>}
   */
  async warmup() {
    console.log('預熱嵌入模型...');
    await this.embed('This is a warmup text for the embedding model.');
    console.log('模型預熱完成');
  }
  
  /**
   * 獲取向量維度
   * @returns {number}
   */
  getDimension() {
    return this.dimensions;
  }
  
  /**
   * 獲取模型信息
   * @returns {Object}
   */
  getModelInfo() {
    return {
      name: this.modelName,
      dim: this.dimensions,
      normalize: this.normalize,
      maxLength: this.maxLength,
      pooling: this.pooling,
      initialized: this.initialized
    };
  }
  
  /**
   * 檢查是否已初始化
   * @returns {boolean}
   */
  isReady() {
    return this.initialized;
  }

  /**
   * 生成單個文本的向量
   * @param {string} text - 輸入文本
   * @param {Object} options - 生成選項
   * @returns {Promise<Float32Array>} 384維向量
   */
  async embed(text, options = {}) {
    // 前置檢查
    if (!this.initialized) {
      throw new Error('LocalEmbedder 未初始化，請先調用 initialize()');
    }
    
    if (!text || typeof text !== 'string') {
      throw new Error('無效的文本輸入');
    }
    
    try {
      // 文本預處理
      let processedText = text.trim();
      if (processedText.length > this.maxLength * 4) {
        // 粗略估計，一個token約4個字符
        processedText = processedText.substring(0, this.maxLength * 4);
      }
      
      // 生成嵌入
      const output = await this.pipeline(processedText, {
        pooling: this.pooling,
        normalize: this.normalize
      });
      
      // 提取向量數據
      let vector;
      if (output && output.data) {
        vector = new Float32Array(output.data);
      } else if (output && Array.isArray(output)) {
        vector = new Float32Array(output);
      } else {
        throw new Error('未能從模型獲取有效的向量輸出');
      }
      
      // 驗證維度
      if (vector.length !== this.dimensions) {
        throw new Error(`向量維度不匹配: 預期 ${this.dimensions}，實際 ${vector.length}`);
      }
      
      // 如果需要正規化且模型未自動正規化
      if (this.normalize && !options.skipNormalize) {
        vector = LocalEmbedder.normalize(vector);
      }
      
      return vector;
    } catch (error) {
      throw new Error(`生成向量失敗: ${error.message}`);
    }
  }

  /**
   * 批量生成向量
   * @param {Array<string>} texts - 文本數組
   * @param {Object} options - 批處理選項
   * @returns {Promise<Array<Float32Array>>} 向量數組
   */
  async embedBatch(texts, options = {}) {
    const batchSize = options.batchSize || 32;
    const onProgress = options.onProgress || (() => {});
    const dedupe = options.dedupe || false;
    
    // 輸入驗證
    if (!Array.isArray(texts)) {
      throw new Error('輸入必須是文本數組');
    }
    
    // 去重處理
    let processedTexts = texts;
    let textToIndex = new Map();
    
    if (dedupe) {
      const uniqueTexts = [];
      texts.forEach((text, index) => {
        if (!textToIndex.has(text)) {
          textToIndex.set(text, [index]);
          uniqueTexts.push(text);
        } else {
          textToIndex.get(text).push(index);
        }
      });
      processedTexts = uniqueTexts;
    }
    
    // 批量處理
    const results = [];
    for (let i = 0; i < processedTexts.length; i += batchSize) {
      const batch = processedTexts.slice(i, i + batchSize);
      
      // 處理當前批次
      const batchVectors = await Promise.all(
        batch.map(text => this.embed(text, options))
      );
      
      results.push(...batchVectors);
      
      // 報告進度
      const processed = Math.min(i + batchSize, processedTexts.length);
      onProgress(processed, processedTexts.length);
    }
    
    // 如果有去重，恢復原始順序
    if (dedupe) {
      const finalResults = new Array(texts.length);
      let vectorIndex = 0;
      for (const [text, indices] of textToIndex) {
        const vector = results[vectorIndex++];
        for (const idx of indices) {
          finalResults[idx] = vector;
        }
      }
      return finalResults;
    }
    
    return results;
  }

  /**
   * 計算兩個向量的餘弦相似度
   * @param {Float32Array} vec1 - 向量1
   * @param {Float32Array} vec2 - 向量2
   * @returns {number} 相似度分數 (0-1)
   */
  static cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('向量維度必須相同');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (norm1 * norm2);
  }
  
  /**
   * 正規化向量
   * @param {Float32Array} vector - 原始向量
   * @returns {Float32Array} 正規化向量
   */
  static normalize(vector) {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (norm === 0) {
      return vector;
    }
    
    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / norm;
    }
    
    return normalized;
  }
  
  /**
   * 計算點積
   * @param {Float32Array} vec1
   * @param {Float32Array} vec2
   * @returns {number}
   */
  static dotProduct(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('向量維度必須相同');
    }
    
    let product = 0;
    for (let i = 0; i < vec1.length; i++) {
      product += vec1[i] * vec2[i];
    }
    
    return product;
  }

  /**
   * 清理資源
   * @returns {Promise<void>}
   */
  async dispose() {
    if (this.pipeline) {
      // 清理pipeline資源
      this.pipeline = null;
    }
    
    this.model = null;
    this.tokenizer = null;
    this.initialized = false;
    
    console.log('LocalEmbedder 資源已清理');
  }
}

// 導出定義
export default LocalEmbedder;
