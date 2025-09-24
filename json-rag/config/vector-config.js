// config/vector-config.js
// JSON-RAG v5.2.1 向量配置文件
// 2025-09-17

/**
 * 向量索引配置
 */
export const vectorConfig = {
  // 開發環境配置
  development: {
    enableVectorSearch: true,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    modelCachePath: './models',
    vectorIndexPath: './data/dev-vector.hnsw',
    vectorSidecarPath: './data/dev-vector.db',
    maxVectors: 100000,
    rebuildThreshold: 0.3,  // 30%刪除觸發重建
    dimensions: 384,
    space: 'ip',           // 內積空間（需要正規化）
    m: 16,
    efConstruction: 200,
    efSearch: 50,
    autoSave: true,
    autoSaveInterval: 60000 // 1分鐘
  },
  
  // 生產環境配置
  production: {
    enableVectorSearch: true,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    modelCachePath: './models',
    vectorIndexPath: './data/vector_index.hnsw',
    vectorSidecarPath: './data/vector_sidecar.db',
    maxVectors: 1000000,
    rebuildThreshold: 0.5,
    dimensions: 384,
    space: 'ip',
    m: 16,
    efConstruction: 200,
    efSearch: 50,
    autoSave: true,
    autoSaveInterval: 300000 // 5分鐘
  },
  
  // 測試環境配置
  test: {
    enableVectorSearch: true,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    modelCachePath: './models/test',
    vectorIndexPath: './data/test-vector.hnsw',
    vectorSidecarPath: './data/test-vector.db',
    maxVectors: 10000,
    rebuildThreshold: 0.2,
    dimensions: 384,
    space: 'ip',
    m: 8,
    efConstruction: 100,
    efSearch: 30,
    autoSave: false
  }
};

/**
 * 獲取當前環境配置（瀏覽器兼容）
 * @returns {Object} 當前環境的向量配置
 */
export function getCurrentVectorConfig() {
  // 在瀏覽器環境中使用development配置
  const env = (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'development';
  return vectorConfig[env] || vectorConfig.development;
}

/**
 * 創建向量索引配置
 * @param {Object} overrides - 覆蓋配置
 * @returns {Object} 完整的向量索引配置
 */
export function createVectorIndexConfig(overrides = {}) {
  const config = getCurrentVectorConfig();
  
  return {
    ...config,
    ...overrides,
    // 確保路徑存在
    indexPath: overrides.indexPath || config.vectorIndexPath,
    sidecarPath: overrides.sidecarPath || config.vectorSidecarPath,
    // 確保正規化設置一致
    normalize: config.space === 'ip' ? true : false
  };
}

/**
 * 性能調優建議
 */
export const performanceTuning = {
  // 小規模數據（< 10K文檔）
  small: {
    m: 8,
    efConstruction: 100,
    efSearch: 30,
    autoSaveInterval: 60000
  },
  
  // 中等規模數據（10K-100K文檔）
  medium: {
    m: 16,
    efConstruction: 200,
    efSearch: 50,
    autoSaveInterval: 300000
  },
  
  // 大規模數據（100K-1M文檔）
  large: {
    m: 32,
    efConstruction: 400,
    efSearch: 100,
    autoSaveInterval: 600000
  },
  
  // 超大規模數據（> 1M文檔）
  xlarge: {
    m: 48,
    efConstruction: 800,
    efSearch: 200,
    autoSaveInterval: 1800000
  }
};

/**
 * 根據數據規模獲取推薦配置
 * @param {number} documentCount - 文檔數量
 * @returns {Object} 推薦的配置
 */
export function getRecommendedConfig(documentCount) {
  if (documentCount < 10000) {
    return performanceTuning.small;
  } else if (documentCount < 100000) {
    return performanceTuning.medium;
  } else if (documentCount < 1000000) {
    return performanceTuning.large;
  } else {
    return performanceTuning.xlarge;
  }
}
