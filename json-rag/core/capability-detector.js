/**
 * JSON-RAG v5.2 能力檢測器
 * 負責檢測運行環境並選擇最佳的存儲和索引實現
 */

export class CapabilityDetector {
  constructor() {
    this.capabilities = {
      storage: {},
      index: {},
      compute: {},
      environment: {}
    };
  }

  /**
   * 檢測所有能力
   * @returns {Promise<Capabilities>}
   */
  async detectAll() {
    // 檢測環境
    this.capabilities.environment = await this.detectEnvironment();
    
    // 檢測存儲能力
    this.capabilities.storage = await this.detectStorageCapabilities();
    
    // 檢測索引能力
    this.capabilities.index = await this.detectIndexCapabilities();
    
    // 檢測計算能力
    this.capabilities.compute = await this.detectComputeCapabilities();
    
    return this.capabilities;
  }

  /**
   * 檢測運行環境
   */
  async detectEnvironment() {
    const env = {
      platform: 'unknown',
      runtime: 'unknown',
      version: '',
      features: []
    };

    // 檢測Node.js環境
    if (typeof global !== 'undefined' && global.process) {
      env.platform = 'node';
      env.runtime = 'node';
      env.version = process.version;
      env.features = ['fs', 'crypto', 'worker_threads'];
      
      // 檢測Electron
      if (process.versions && process.versions.electron) {
        env.platform = 'electron';
        env.features.push('electron');
      }
    }
    // 檢測瀏覽器環境
    else if (typeof window !== 'undefined') {
      env.platform = 'browser';
      env.runtime = this.detectBrowserRuntime();
      
      // 檢測瀏覽器特性
      if ('indexedDB' in window) env.features.push('indexedDB');
      if ('localStorage' in window) env.features.push('localStorage');
      if ('caches' in window) env.features.push('caches');
      if ('serviceWorker' in navigator) env.features.push('serviceWorker');
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        env.features.push('storageQuota');
      }
    }
    // 檢測Deno環境
    else if (typeof Deno !== 'undefined') {
      env.platform = 'deno';
      env.runtime = 'deno';
      env.version = Deno.version.deno;
      env.features = ['fs', 'crypto', 'workers'];
    }

    return env;
  }

  /**
   * 檢測瀏覽器運行時
   */
  detectBrowserRuntime() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('chrome')) return 'chrome';
    if (userAgent.includes('firefox')) return 'firefox';
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) return 'safari';
    if (userAgent.includes('edge')) return 'edge';
    
    return 'unknown';
  }

  /**
   * 檢測存儲能力
   */
  async detectStorageCapabilities() {
    const storage = {
      available: [],
      preferred: null,
      quota: null
    };

    // Node.js環境
    if (this.capabilities.environment.platform === 'node') {
      // 檢測SQLite
      if (await this.checkNodeModule('better-sqlite3')) {
        storage.available.push('sqlite');
        storage.preferred = 'sqlite';
      }
      
      // 檢測LevelDB
      if (await this.checkNodeModule('level')) {
        storage.available.push('leveldb');
        if (!storage.preferred) storage.preferred = 'leveldb';
      }
      
      // 文件系統總是可用
      storage.available.push('fs');
      if (!storage.preferred) storage.preferred = 'fs';
    }
    // 瀏覽器環境
    else if (this.capabilities.environment.platform === 'browser') {
      // 檢測OPFS (Origin Private File System)
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        storage.available.push('opfs');
        storage.preferred = 'opfs';
        
        // 檢測配額
        try {
          const estimate = await navigator.storage.estimate();
          storage.quota = {
            usage: estimate.usage || 0,
            quota: estimate.quota || 0
          };
        } catch (e) {
          // 忽略錯誤
        }
      }
      
      // IndexedDB
      if ('indexedDB' in window) {
        storage.available.push('indexeddb');
        if (!storage.preferred) storage.preferred = 'indexeddb';
      }
      
      // LocalStorage (作為備選)
      if ('localStorage' in window) {
        storage.available.push('localstorage');
      }
    }

    return storage;
  }

  /**
   * 檢測索引能力
   */
  async detectIndexCapabilities() {
    const index = {
      structural: [],
      fulltext: [],
      vector: [],
      preferred: {}
    };

    // Node.js環境
    if (this.capabilities.environment.platform === 'node') {
      // SQLite支援FTS5
      if (this.capabilities.storage.available.includes('sqlite')) {
        index.structural.push('sqlite-index');
        index.fulltext.push('fts5');
        index.preferred.structural = 'sqlite-index';
        index.preferred.fulltext = 'fts5';
        
        // 檢測SQLite-VSS (向量擴展)
        if (await this.checkNodeModule('sqlite-vss')) {
          index.vector.push('sqlite-vss');
          index.preferred.vector = 'sqlite-vss';
        }
      }
      
      // 檢測獨立的向量庫
      if (await this.checkNodeModule('hnswlib-node')) {
        index.vector.push('hnswlib');
        if (!index.preferred.vector) index.preferred.vector = 'hnswlib';
      }
    }
    // 瀏覽器環境
    else if (this.capabilities.environment.platform === 'browser') {
      // 瀏覽器中的結構化索引
      if (this.capabilities.storage.available.includes('indexeddb')) {
        index.structural.push('indexeddb-index');
        index.preferred.structural = 'indexeddb-index';
      }
      
      // 瀏覽器中的全文搜索
      if (await this.checkBrowserModule('minisearch')) {
        index.fulltext.push('minisearch');
        index.preferred.fulltext = 'minisearch';
      }
      
      // 瀏覽器中的向量搜索（通過WASM）
      if ('WebAssembly' in window) {
        index.vector.push('wasm-vector');
        index.preferred.vector = 'wasm-vector';
      }
    }

    return index;
  }

  /**
   * 檢測計算能力
   */
  async detectComputeCapabilities() {
    const compute = {
      workers: false,
      simd: false,
      gpu: false,
      wasm: false,
      localEmbedding: false
    };

    // 檢測Web Workers / Worker Threads
    if (this.capabilities.environment.platform === 'node') {
      try {
        const { Worker } = await import('worker_threads');
        compute.workers = true;
      } catch (e) {
        // 不支援
      }
    } else if (this.capabilities.environment.platform === 'browser') {
      compute.workers = 'Worker' in window;
      compute.wasm = 'WebAssembly' in window;
      
      // 檢測WebGL/WebGPU (用於加速)
      if ('gpu' in navigator) {
        compute.gpu = true;
      }
    }

    // 檢測本地嵌入模型支援
    if (compute.wasm || this.capabilities.environment.platform === 'node') {
      compute.localEmbedding = true;
    }

    return compute;
  }

  /**
   * 檢查Node模組是否可用
   */
  async checkNodeModule(moduleName) {
    if (this.capabilities.environment.platform !== 'node') {
      return false;
    }

    try {
      await import(moduleName);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 檢查瀏覽器模組是否可用
   */
  async checkBrowserModule(moduleName) {
    if (this.capabilities.environment.platform !== 'browser') {
      return false;
    }

    // 這裡簡化處理，實際應該通過動態import檢測
    const knownModules = ['minisearch', 'comlink', 'idb'];
    return knownModules.includes(moduleName);
  }

  /**
   * 推薦最佳配置
   * @param {Capabilities} capabilities - 檢測到的能力
   * @returns {RecommendedConfig}
   */
  recommendConfiguration(capabilities = this.capabilities) {
    const config = {
      storage: null,
      index: {},
      features: []
    };

    // 選擇存儲
    config.storage = capabilities.storage.preferred || 'memory';

    // 選擇索引
    config.index = {
      structural: capabilities.index.preferred.structural || 'memory',
      fulltext: capabilities.index.preferred.fulltext || null,
      vector: capabilities.index.preferred.vector || null
    };

    // 推薦功能
    if (capabilities.compute.workers) {
      config.features.push('parallel-indexing');
    }
    
    if (capabilities.compute.localEmbedding) {
      config.features.push('local-embeddings');
    }
    
    if (capabilities.storage.quota && capabilities.storage.quota.quota > 1e9) {
      config.features.push('large-scale-storage');
    }

    return config;
  }

  /**
   * 獲取狀態報告
   */
  getReport() {
    const report = {
      environment: this.capabilities.environment,
      storage: {
        ...this.capabilities.storage,
        recommendation: this.capabilities.storage.preferred
      },
      index: {
        ...this.capabilities.index,
        recommendations: this.capabilities.index.preferred
      },
      compute: this.capabilities.compute,
      overall: this.recommendConfiguration()
    };

    return report;
  }
}

/**
 * 類型定義
 */

/**
 * @typedef {Object} Capabilities
 * @property {EnvironmentInfo} environment
 * @property {StorageCapabilities} storage
 * @property {IndexCapabilities} index
 * @property {ComputeCapabilities} compute
 */

/**
 * @typedef {Object} EnvironmentInfo
 * @property {string} platform - 'node' | 'browser' | 'electron' | 'deno'
 * @property {string} runtime - 具體運行時
 * @property {string} version - 版本號
 * @property {string[]} features - 支援的特性列表
 */

/**
 * @typedef {Object} StorageCapabilities
 * @property {string[]} available - 可用的存儲類型
 * @property {string} preferred - 推薦的存儲類型
 * @property {QuotaInfo} [quota] - 存儲配額信息
 */

/**
 * @typedef {Object} QuotaInfo
 * @property {number} usage - 已使用空間
 * @property {number} quota - 總配額
 */

/**
 * @typedef {Object} IndexCapabilities
 * @property {string[]} structural - 結構化索引選項
 * @property {string[]} fulltext - 全文索引選項
 * @property {string[]} vector - 向量索引選項
 * @property {IndexPreferences} preferred - 推薦的索引類型
 */

/**
 * @typedef {Object} IndexPreferences
 * @property {string} structural
 * @property {string} fulltext
 * @property {string} vector
 */

/**
 * @typedef {Object} ComputeCapabilities
 * @property {boolean} workers - 是否支援多線程
 * @property {boolean} simd - 是否支援SIMD
 * @property {boolean} gpu - 是否支援GPU加速
 * @property {boolean} wasm - 是否支援WebAssembly
 * @property {boolean} localEmbedding - 是否支援本地嵌入
 */

/**
 * @typedef {Object} RecommendedConfig
 * @property {string} storage - 推薦的存儲類型
 * @property {Object} index - 推薦的索引配置
 * @property {string[]} features - 推薦啟用的功能
 */

// 創建單例實例
export const capabilityDetector = new CapabilityDetector();
