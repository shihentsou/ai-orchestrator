/**
 * JSON-RAG v5.2 適配器註冊表
 * 管理和載入不同的適配器實現
 */

export class AdapterRegistry {
  constructor() {
    // 預註冊的適配器
    this.storageAdapters = {
      'memory': () => import('../adapters/storage/memory-adapter.js'),
      'sqlite': () => import('../adapters/storage/sqlite-adapter.js'),
      'indexeddb': () => import('../adapters/storage/indexeddb-adapter.js'),
      'fs': () => import('../adapters/storage/fs-adapter.js'),
      'opfs': () => import('../adapters/storage/opfs-adapter.js')
    };

    this.indexAdapters = {
      // 結構化索引
      'memory': () => import('../adapters/index/memory-index-adapter.js'),
      'sqlite-structural': () => import('../adapters/index/sqlite-index-adapter.js'),
      'indexeddb-structural': () => import('../adapters/index/indexeddb-index-adapter.js'),
      
      // 全文索引
      'sqlite-fts': () => import('../adapters/index/fts5-adapter.js'),
      'memory-fts': () => import('../adapters/index/minisearch-adapter.js'),
      
      // 向量索引
      'sqlite-vector': () => import('../adapters/index/sqlite-vss-adapter.js'),
      'memory-vector': () => import('../adapters/index/hnswlib-adapter.js'),
      'wasm-vector': () => import('../adapters/index/wasm-vector-adapter.js'),
      
      // 保留舊名稱以確保向後相容
      'sqlite-index': () => import('../adapters/index/sqlite-index-adapter.js'),
      'indexeddb-index': () => import('../adapters/index/indexeddb-index-adapter.js'),
      'fts5': () => import('../adapters/index/fts5-adapter.js'),
      'minisearch': () => import('../adapters/index/minisearch-adapter.js'),
      'sqlite-vss': () => import('../adapters/index/sqlite-vss-adapter.js'),
      'hnswlib': () => import('../adapters/index/hnswlib-adapter.js')
    };

    this.cacheAdapters = {
      'memory': () => import('../adapters/cache/memory-cache-adapter.js'),
      'redis': () => import('../adapters/cache/redis-cache-adapter.js'),
      'lru': () => import('../adapters/cache/lru-cache-adapter.js')
    };

    this.telemetryAdapters = {
      'console': () => import('../adapters/telemetry/console-telemetry-adapter.js'),
      'opentelemetry': () => import('../adapters/telemetry/opentelemetry-adapter.js')
    };

    // 自定義適配器
    this.customAdapters = new Map();
  }

  /**
   * 註冊自定義存儲適配器
   * @param {string} name - 適配器名稱
   * @param {Function} loader - 動態載入函數
   */
  registerStorageAdapter(name, loader) {
    this.storageAdapters[name] = loader;
  }

  /**
   * 註冊自定義索引適配器
   * @param {string} name - 適配器名稱
   * @param {Function} loader - 動態載入函數
   * @param {string} type - 索引類型: 'structural' | 'fulltext' | 'vector'
   */
  registerIndexAdapter(name, loader, type) {
    const key = `${name}-${type}`;
    this.indexAdapters[key] = loader;
  }

  /**
   * 註冊自定義緩存適配器
   * @param {string} name - 適配器名稱
   * @param {Function} loader - 動態載入函數
   */
  registerCacheAdapter(name, loader) {
    this.cacheAdapters[name] = loader;
  }

  /**
   * 註冊自定義遙測適配器
   * @param {string} name - 適配器名稱
   * @param {Function} loader - 動態載入函數
   */
  registerTelemetryAdapter(name, loader) {
    this.telemetryAdapters[name] = loader;
  }

  /**
   * 獲取存儲適配器
   * @param {string} name - 適配器名稱
   * @returns {Promise<Class>} 適配器類
   */
  async getStorageAdapter(name) {
    const loader = this.storageAdapters[name];
    if (!loader) {
      throw new Error(`未知的存儲適配器: ${name}`);
    }

    try {
      const module = await loader();
      return module.default || module[Object.keys(module)[0]];
    } catch (error) {
      // 如果載入失敗，嘗試降級到內存適配器
      console.warn(`載入 ${name} 存儲適配器失敗，降級到內存適配器:`, error.message);
      const memoryModule = await this.storageAdapters['memory']();
      return memoryModule.default || memoryModule.MemoryStorageAdapter;
    }
  }

  /**
   * 獲取索引適配器
   * @param {string} name - 適配器名稱
   * @param {string} type - 索引類型
   * @returns {Promise<Class>} 適配器類
   */
  async getIndexAdapter(name, type) {
    // 首先嘗試特定類型的適配器
    let loader = this.indexAdapters[`${name}-${type}`] || this.indexAdapters[name];
    
    if (!loader) {
      throw new Error(`未知的索引適配器: ${name} (${type})`);
    }

    try {
      const module = await loader();
      return module.default || module[Object.keys(module)[0]];
    } catch (error) {
      // 如果載入失敗，嘗試降級到內存索引
      console.warn(`載入 ${name} 索引適配器失敗，降級到內存索引:`, error.message);
      const memoryModule = await this.indexAdapters['memory']();
      return memoryModule.default || memoryModule.MemoryIndexAdapter;
    }
  }

  /**
   * 獲取緩存適配器
   * @param {string} name - 適配器名稱
   * @returns {Promise<Class>} 適配器類
   */
  async getCacheAdapter(name) {
    const loader = this.cacheAdapters[name];
    if (!loader) {
      throw new Error(`未知的緩存適配器: ${name}`);
    }

    try {
      const module = await loader();
      return module.default || module[Object.keys(module)[0]];
    } catch (error) {
      // 如果載入失敗，降級到內存緩存
      console.warn(`載入 ${name} 緩存適配器失敗，降級到內存緩存:`, error.message);
      const memoryModule = await this.cacheAdapters['memory']();
      return memoryModule.default || memoryModule.MemoryCacheAdapter;
    }
  }

  /**
   * 獲取遙測適配器
   * @param {string} name - 適配器名稱
   * @returns {Promise<Class>} 適配器類
   */
  async getTelemetryAdapter(name) {
    const loader = this.telemetryAdapters[name];
    if (!loader) {
      throw new Error(`未知的遙測適配器: ${name}`);
    }

    try {
      const module = await loader();
      return module.default || module[Object.keys(module)[0]];
    } catch (error) {
      // 如果載入失敗，降級到控制台輸出
      console.warn(`載入 ${name} 遙測適配器失敗，降級到控制台:`, error.message);
      const consoleModule = await this.telemetryAdapters['console']();
      return consoleModule.default || consoleModule.ConsoleTelemetryAdapter;
    }
  }

  /**
   * 檢查適配器是否可用
   * @param {string} type - 適配器類型
   * @param {string} name - 適配器名稱
   * @returns {Promise<boolean>}
   */
  async isAdapterAvailable(type, name) {
    try {
      switch (type) {
        case 'storage':
          await this.getStorageAdapter(name);
          return true;
        case 'index':
          await this.getIndexAdapter(name, 'structural');
          return true;
        case 'cache':
          await this.getCacheAdapter(name);
          return true;
        case 'telemetry':
          await this.getTelemetryAdapter(name);
          return true;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * 獲取所有可用的適配器
   * @returns {Object} 可用適配器列表
   */
  getAvailableAdapters() {
    return {
      storage: Object.keys(this.storageAdapters),
      index: Object.keys(this.indexAdapters),
      cache: Object.keys(this.cacheAdapters),
      telemetry: Object.keys(this.telemetryAdapters)
    };
  }

  /**
   * 載入插件
   * @param {string} pluginPath - 插件路徑
   */
  async loadPlugin(pluginPath) {
    try {
      const plugin = await import(pluginPath);
      
      if (typeof plugin.register === 'function') {
        await plugin.register(this);
        console.log(`[AdapterRegistry] 成功載入插件: ${pluginPath}`);
      } else {
        console.warn(`[AdapterRegistry] 插件缺少 register 函數: ${pluginPath}`);
      }
    } catch (error) {
      console.error(`[AdapterRegistry] 載入插件失敗: ${pluginPath}`, error);
    }
  }

  /**
   * 批量載入插件
   * @param {string[]} pluginPaths - 插件路徑列表
   */
  async loadPlugins(pluginPaths) {
    const promises = pluginPaths.map(path => this.loadPlugin(path));
    await Promise.allSettled(promises);
  }
}

// 創建全局註冊表實例
export const adapterRegistry = new AdapterRegistry();
