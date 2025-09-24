/**
 * JSON-RAG v5.2 核心介面定義
 * 這些介面定義了系統的核心契約，保持穩定不變
 */

/**
 * 存儲端口介面
 * 定義了所有存儲適配器必須實現的方法
 */
export class StoragePort {
  /**
   * 存儲一個文檔
   * @param {string} key - 文檔唯一標識
   * @param {any} value - 文檔內容
   * @returns {Promise<void>}
   */
  async put(key, value) {
    throw new Error('StoragePort.put must be implemented');
  }

  /**
   * 獲取一個文檔
   * @param {string} key - 文檔唯一標識
   * @returns {Promise<any>}
   */
  async get(key) {
    throw new Error('StoragePort.get must be implemented');
  }

  /**
   * 查詢文檔
   * @param {QueryCriteria} criteria - 查詢條件
   * @returns {Promise<Result[]>}
   */
  async query(criteria) {
    throw new Error('StoragePort.query must be implemented');
  }

  /**
   * 批量寫入操作
   * @param {Operation[]} operations - 批量操作列表
   * @returns {Promise<void>}
   */
  async bulkWrite(operations) {
    throw new Error('StoragePort.bulkWrite must be implemented');
  }

  /**
   * 創建快照
   * @returns {Promise<Snapshot>}
   */
  async createSnapshot() {
    throw new Error('StoragePort.createSnapshot must be implemented');
  }
}

/**
 * 索引端口介面
 * 支援結構化索引、全文索引和向量索引
 */
export class IndexPort {
  // 結構化索引
  /**
   * 創建索引
   * @param {string} field - 索引字段
   * @param {IndexOptions} options - 索引選項
   * @returns {Promise<void>}
   */
  async createIndex(field, options = {}) {
    throw new Error('IndexPort.createIndex must be implemented');
  }

  /**
   * 通過索引查找
   * @param {string} field - 索引字段
   * @param {any} value - 查找值
   * @returns {Promise<string[]>} - 文檔ID列表
   */
  async findByIndex(field, value) {
    throw new Error('IndexPort.findByIndex must be implemented');
  }

  // 全文索引
  /**
   * 添加到全文搜索
   * @param {string} docId - 文檔ID
   * @param {string} content - 文檔內容
   * @returns {Promise<void>}
   */
  async addToFTS(docId, content) {
    throw new Error('IndexPort.addToFTS must be implemented');
  }

  /**
   * 全文搜索
   * @param {string} query - 搜索查詢
   * @param {SearchOptions} options - 搜索選項
   * @returns {Promise<Result[]>}
   */
  async searchFTS(query, options = {}) {
    throw new Error('IndexPort.searchFTS must be implemented');
  }

  // 向量索引（v5.2新增）
  /**
   * 添加向量嵌入
   * @param {string} docId - 文檔ID
   * @param {Float32Array} vector - 向量表示
   * @returns {Promise<void>}
   */
  async addEmbedding(docId, vector) {
    throw new Error('IndexPort.addEmbedding must be implemented');
  }

  /**
   * 相似性搜索
   * @param {Float32Array} vector - 查詢向量
   * @param {number} k - 返回結果數量
   * @returns {Promise<Result[]>}
   */
  async searchSimilar(vector, k = 10) {
    throw new Error('IndexPort.searchSimilar must be implemented');
  }

  /**
   * 重建向量索引
   * @param {string} model - 嵌入模型名稱
   * @returns {Promise<void>}
   */
  async rebuildEmbeddings(model) {
    throw new Error('IndexPort.rebuildEmbeddings must be implemented');
  }
}

/**
 * 查詢端口介面
 * 提供統一的混合查詢能力
 */
export class QueryPort {
  /**
   * 混合搜索
   * @param {SearchRequest} request - 搜索請求
   * @returns {Promise<SearchResult>}
   */
  async search(request) {
    throw new Error('QueryPort.search must be implemented');
  }
}

/**
 * 類型定義
 */

/**
 * @typedef {Object} QueryCriteria
 * @property {string} [collection] - 集合名稱
 * @property {TimeRange} [timeRange] - 時間範圍
 * @property {string[]} [tags] - 標籤列表
 * @property {Object} [metadata] - 元數據過濾
 */

/**
 * @typedef {Object} TimeRange
 * @property {string} [start] - 開始時間
 * @property {string} [end] - 結束時間
 */

/**
 * @typedef {Object} Result
 * @property {string} id - 文檔ID
 * @property {any} data - 文檔數據
 * @property {number} [score] - 相關性分數
 * @property {Citation} [citation] - 引用信息
 */

/**
 * @typedef {Object} Citation
 * @property {string} source - 來源
 * @property {string} documentId - 文檔ID
 * @property {number} timestamp - 時間戳
 * @property {string} checksum - 校驗和
 * @property {LocationInfo} location - 位置信息
 */

/**
 * @typedef {Object} LocationInfo
 * @property {string} collection - 集合名稱
 * @property {number} [offset] - 偏移量
 * @property {number} [length] - 長度
 */

/**
 * @typedef {Object} Operation
 * @property {string} type - 操作類型: 'put' | 'delete' | 'update'
 * @property {string} key - 文檔鍵
 * @property {any} [value] - 文檔值（put/update時需要）
 */

/**
 * @typedef {Object} Snapshot
 * @property {string} id - 快照ID
 * @property {number} timestamp - 創建時間戳
 * @property {SnapshotMetadata} metadata - 快照元數據
 */

/**
 * @typedef {Object} SnapshotMetadata
 * @property {number} documentCount - 文檔數量
 * @property {number} totalSize - 總大小
 * @property {string} checksum - 校驗和
 */

/**
 * @typedef {Object} IndexOptions
 * @property {boolean} [unique] - 是否唯一索引
 * @property {boolean} [sparse] - 是否稀疏索引
 * @property {string} [type] - 索引類型
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit] - 結果限制
 * @property {number} [offset] - 偏移量
 * @property {string[]} [highlight] - 高亮字段
 */

/**
 * @typedef {Object} SearchRequest
 * @property {StructuralQuery} [structural] - 結構化查詢
 * @property {SemanticQuery} [semantic] - 語義查詢
 * @property {HybridStrategy} [hybrid] - 混合策略
 */

/**
 * @typedef {Object} StructuralQuery
 * @property {string} [collection] - 集合過濾
 * @property {TimeRange} [timeRange] - 時間範圍
 * @property {string[]} [tags] - 標籤過濾
 * @property {Object} [metadata] - 元數據過濾
 * @property {number} [limit] - 結果限制
 */

/**
 * @typedef {Object} SemanticQuery
 * @property {string} query - 查詢文本
 * @property {boolean} [useEmbedding] - 是否使用向量
 * @property {number} [threshold] - 相似度閾值
 * @property {string} [model] - 嵌入模型
 */

/**
 * @typedef {'filter-first' | 'semantic-first' | 'parallel'} HybridStrategy
 */

/**
 * @typedef {Object} SearchResult
 * @property {Result[]} results - 結果列表
 * @property {number} totalCount - 總數量
 * @property {QueryMetrics} metrics - 查詢指標
 */

/**
 * @typedef {Object} QueryMetrics
 * @property {number} latency - 查詢延遲(ms)
 * @property {string} strategy - 使用的策略
 * @property {number} documentsScanned - 掃描的文檔數
 * @property {boolean} cacheHit - 是否命中緩存
 */
