/**
 * JSON-RAG v5.2 核心類
 * 統一的知識管理系統入口
 */

import { CapabilityDetector } from './capability-detector.js';
import { StoragePort, IndexPort, QueryPort } from './interfaces.js';
import { QueryEngine } from './query-engine.js';
import { AdapterRegistry } from './adapter-registry.js';
import { AdapterInit } from './types.js';

export class JSONRAGCore {
  constructor(config = {}) {
    this.config = {
      autoDetect: true,
      storage: null,
      index: null,
      cache: null,
      telemetry: null,
      ...config
    };
    
    this.initialized = false;
    this.adapters = {};
    this.registry = new AdapterRegistry();
    this.queryEngine = null;
    
    // 性能指標
    this.metrics = {
      documentsCount: 0,
      totalSize: 0,
      queryCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * 初始化系統
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    // 自動檢測能力
    if (this.config.autoDetect) {
      await this.autoDetectAndConfigure();
    } else {
      await this.manualConfigure();
    }

    // 創建查詢引擎
    this.queryEngine = new QueryEngine(this.adapters);

    // 載入現有數據的元數據
    await this.loadMetadata();

    this.initialized = true;
  }

  /**
   * 自動檢測並配置
   */
  async autoDetectAndConfigure() {
    const detector = new CapabilityDetector();
    const capabilities = await detector.detectAll();
    const recommended = detector.recommendConfiguration(capabilities);

    console.log('[JSON-RAG] 環境檢測完成:', {
      platform: capabilities.environment.platform,
      storage: recommended.storage,
      index: recommended.index
    });

    // 根據推薦配置創建適配器
    await this.createAdapters(recommended);
  }

  /**
   * 手動配置
   */
  async manualConfigure() {
    const config = {
      storage: this.config.storage || 'memory',
      index: this.config.index || {
        structural: 'memory',
        fulltext: null,
        vector: null
      }
    };

    await this.createAdapters(config);
  }

  /**
   * 創建適配器
   */
  async createAdapters(config) {
    // 創建存儲適配器
    const StorageAdapter = await this.registry.getStorageAdapter(config.storage);
    const storageInit = new AdapterInit({
      id: 'storage-primary',
      config: this.config.storageOptions || {},
      logger: console,
      telemetry: this.adapters.telemetry
    });
    this.adapters.storage = new StorageAdapter(storageInit);
    await this.adapters.storage.initialize();

    // 創建結構化索引適配器
    if (config.index.structural) {
      const StructuralAdapter = await this.registry.getIndexAdapter(
        config.index.structural, 
        'structural'
      );
      
      const indexInit = new AdapterInit({
        id: 'index-structural',
        config: this.config.indexOptions || {},
        logger: console,
        telemetry: this.adapters.telemetry,
        deps: { storage: this.adapters.storage }
      });
      
      this.adapters.structural = new StructuralAdapter(indexInit);
      await this.adapters.structural.initialize();
    }

    // 創建全文索引適配器（可選）
    if (config.index.fulltext) {
      const FTSAdapter = await this.registry.getIndexAdapter(
        config.index.fulltext, 
        'fulltext'
      );
      
      const ftsInit = new AdapterInit({
        id: 'index-fts',
        config: this.config.indexOptions || {},
        logger: console,
        telemetry: this.adapters.telemetry,
        deps: { storage: this.adapters.storage }
      });
      
      this.adapters.fts = new FTSAdapter(ftsInit);
      await this.adapters.fts.initialize();
      
      // GPT-5建議：創建別名橋接以保持向後兼容
      this.adapters.index = this.adapters.index || {};
      this.adapters.index.fulltext = this.adapters.fts;
      console.log('[JSON-RAG] Created alias: adapters.index.fulltext -> adapters.fts');
    }

    // 創建向量索引適配器（可選）
    if (config.index.vector) {
      const VectorAdapter = await this.registry.getIndexAdapter(
        config.index.vector, 
        'vector'
      );
      
      const vectorInit = new AdapterInit({
        id: 'index-vector',
        config: this.config.indexOptions || {},
        logger: console,
        telemetry: this.adapters.telemetry,
        deps: { storage: this.adapters.storage }
      });
      
      this.adapters.vector = new VectorAdapter(vectorInit);
      await this.adapters.vector.initialize();
    }

    // 創建緩存適配器（可選）
    if (this.config.cache) {
      const CacheAdapter = await this.registry.getCacheAdapter(this.config.cache);
      const cacheInit = new AdapterInit({
        id: 'cache-primary',
        config: this.config.cacheOptions || {},
        logger: console,
        telemetry: this.adapters.telemetry
      });
      this.adapters.cache = new CacheAdapter(cacheInit);
      await this.adapters.cache.initialize();
    }

    // 創建遙測適配器（可選）
    if (this.config.telemetry) {
      const TelemetryAdapter = await this.registry.getTelemetryAdapter(this.config.telemetry);
      const telemetryInit = new AdapterInit({
        id: 'telemetry-primary',
        config: this.config.telemetryOptions || {},
        logger: console
      });
      this.adapters.telemetry = new TelemetryAdapter(telemetryInit);
    }
  }

  /**
   * 載入元數據
   */
  async loadMetadata() {
    try {
      const metadata = await this.adapters.storage.getMetadata();
      this.metrics.documentsCount = metadata.documentCount || 0;
      this.metrics.totalSize = metadata.totalSize || 0;
    } catch (error) {
      // 新系統，沒有元數據
      console.log('[JSON-RAG] 初始化新系統');
    }
  }

  /**
   * 存儲文檔
   * @param {string} collection - 集合名稱
   * @param {string} id - 文檔ID
   * @param {any} data - 文檔數據
   * @param {Object} options - 選項
   */
  async put(collection, id, data, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const document = {
      id,
      collection,
      data,
      created_at: Date.now(),
      updated_at: Date.now(),
      ...options.metadata
    };

    // 存儲文檔
    await this.adapters.storage.put(`${collection}:${id}`, document);

    // 更新索引
    await this.updateIndexes(document, options);

    // 更新指標
    this.metrics.documentsCount++;
    this.metrics.totalSize += JSON.stringify(data).length;

    // 清除相關緩存
    if (this.adapters.cache) {
      await this.adapters.cache.invalidate(`${collection}:*`);
    }

    return document;
  }

  /**
   * 獲取文檔
   * @param {string} collection - 集合名稱
   * @param {string} id - 文檔ID
   */
  async get(collection, id) {
    if (!this.initialized) {
      await this.initialize();
    }

    const key = `${collection}:${id}`;

    // 檢查緩存
    if (this.adapters.cache) {
      const cached = await this.adapters.cache.get(key);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
      this.metrics.cacheMisses++;
    }

    // 從存儲獲取
    const document = await this.adapters.storage.get(key);

    // 更新緩存
    if (this.adapters.cache && document) {
      await this.adapters.cache.set(key, document, { ttl: 3600 });
    }

    return document;
  }

  /**
   * 搜索文檔
   * @param {SearchRequest} request - 搜索請求
   */
  async search(request) {
    if (!this.initialized) {
      await this.initialize();
    }

    this.metrics.queryCount++;

    // 轉換請求格式（向後相容）
    if (request.filters && !request.structural) {
      request = {
        structural: request.filters,
        semantic: request.semantic,
        hybrid: request.hybrid
      };
    }

    // 使用查詢引擎執行搜索
    const results = await this.queryEngine.search(request);

    // 記錄遙測
    if (this.adapters.telemetry) {
      this.adapters.telemetry.recordQuery({
        type: request.hybrid || 'structural',
        latency: results.metrics.latency,
        resultCount: results.results.length
      });
    }

    return results;
  }

  /**
   * 更新索引
   */
  async updateIndexes(document, options = {}) {
    const promises = [];

    // 更新結構化索引
    if (this.adapters.structural) {
      // SQLiteIndexAdapter 使用 addDocument 方法
      promises.push(
        this.adapters.structural.addDocument(document.id, document)
      );
    }

    // 更新全文索引
    if (this.adapters.fts && options.fulltext !== false) {
      const content = this.extractTextContent(document.data);
      if (content) {
        // 使用標準接口方法 addToFTS
        promises.push(
          this.adapters.fts.addToFTS(
            `${document.collection}:${document.id}`, // 包含collection的完整ID
            content
          )
        );
        console.log(`[Core] Added document to FTS: ${document.id}, collection: ${document.collection}`);
      }
    }

    // 更新向量索引（按需）
    if (this.adapters.vector && options.embedding) {
      // 如果提供了預計算的向量
      if (options.embedding instanceof Float32Array) {
        promises.push(
          this.adapters.vector.addEmbedding(document.id, options.embedding)
        );
      }
      // 否則檢查是否需要自動生成
      else if (options.autoEmbed) {
        const content = this.extractTextContent(document.data);
        if (content && content.length > 100) {
          // 這裡應該調用嵌入服務，暫時跳過
          console.log('[JSON-RAG] 需要生成向量嵌入:', document.id);
        }
      }
    }

    await Promise.all(promises);
  }

  /**
   * 提取文本內容
   */
  extractTextContent(data) {
    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object' && data !== null) {
      const texts = [];
      
      // 遞歸提取所有文本
      const extract = (obj) => {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.length > 10) {
            texts.push(value);
          } else if (typeof value === 'object' && value !== null) {
            extract(value);
          }
        }
      };

      extract(data);
      return texts.join(' ');
    }

    return '';
  }

  /**
   * 獲取嵌套值
   */
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 批量操作
   * @param {Operation[]} operations
   */
  async bulkWrite(operations) {
    if (!this.initialized) {
      await this.initialize();
    }

    // 按類型分組操作
    const puts = [];
    const deletes = [];

    for (const op of operations) {
      if (op.type === 'put') {
        puts.push(op);
      } else if (op.type === 'delete') {
        deletes.push(op);
      }
    }

    // 批量寫入
    if (puts.length > 0) {
      await this.adapters.storage.bulkWrite(puts);
      
      // 批量更新索引
      for (const op of puts) {
        await this.updateIndexes(op.value, op.options || {});
      }
    }

    // 批量刪除
    if (deletes.length > 0) {
      await this.adapters.storage.bulkWrite(deletes);
      
      // 清理索引
      for (const op of deletes) {
        await this.removeFromIndexes(op.key);
      }
    }

    // 清除緩存
    if (this.adapters.cache) {
      await this.adapters.cache.clear();
    }
  }

  /**
   * 從索引中移除
   */
  async removeFromIndexes(key) {
    const promises = [];

    if (this.adapters.structural) {
      // 從 key 中提取 documentId
      const parts = key.split(':');
      const documentId = parts[parts.length - 1];
      promises.push(this.adapters.structural.removeDocument(documentId));
    }

    if (this.adapters.fts) {
      promises.push(this.adapters.fts.removeFromFTS(key));
    }

    if (this.adapters.vector) {
      promises.push(this.adapters.vector.removeEmbedding(key));
    }

    await Promise.all(promises);
  }

  /**
   * 創建快照
   */
  async createSnapshot() {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.adapters.storage.createSnapshot();
  }

  /**
   * 獲取系統狀態
   */
  getStatus() {
    return {
      initialized: this.initialized,
      adapters: Object.keys(this.adapters),
      metrics: this.metrics,
      config: this.config
    };
  }

  /**
   * 關閉系統
   */
  async close() {
    if (!this.initialized) {
      return;
    }

    // 關閉所有適配器
    const promises = [];

    for (const [name, adapter] of Object.entries(this.adapters)) {
      if (adapter && typeof adapter.close === 'function') {
        promises.push(adapter.close());
      }
    }

    await Promise.all(promises);

    this.initialized = false;
  }
}

// 導出便捷函數
export function createJSONRAG(config) {
  return new JSONRAGCore(config);
}
