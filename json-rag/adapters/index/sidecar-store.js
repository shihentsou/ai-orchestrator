// adapters/index/sidecar-store.js
// 側車存儲管理器 - 用於存儲HNSW索引無法保存的向量和元數據
// v5.2.1修復版 - 2025-09-18 - 遵循模組契約，維度可配置

import Database from 'better-sqlite3';

/**
 * 向量側車存儲類
 * 解決hnswlib限制：無法取回存儲的向量
 * 使用SQLite存儲完整向量和元數據
 * 重要：維度通過配置傳入，不硬編碼
 */
class VectorSidecarStore {
  /**
   * 構造函數
   * @param {string} dbPath - 資料庫路徑
   * @param {Object} config - 配置對象
   * @param {number} config.dimensions - 向量維度（必須與HNSWLibAdapter一致）
   * @param {string} config.space - 距離空間類型
   * @param {string} config.modelName - 模型名稱
   */
  constructor(dbPath, config = {}) {
    this.dbPath = dbPath;
    this.config = {
      dimensions: config.dimensions || 384,  // 默認384，但可配置
      space: config.space || 'ip',
      modelName: config.modelName || 'Xenova/all-MiniLM-L6-v2'
    };
    
    this.db = new Database(dbPath);
    
    // 設置性能優化參數
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('mmap_size = 30000000000');
    
    this.initSchema();
    this.prepareStatements();
  }
  
  /**
   * 初始化資料庫架構
   */
  initSchema() {
    // 計算向量的字節大小（Float32 = 4 bytes）
    const vectorByteSize = this.config.dimensions * 4;
    
    const schema = `
      -- 向量存儲表
      CREATE TABLE IF NOT EXISTS vectors (
        doc_id TEXT PRIMARY KEY,
        label INTEGER UNIQUE NOT NULL,  -- HNSW內部標籤
        vector BLOB NOT NULL,            -- ${this.config.dimensions}維Float32Array序列化
        metadata JSON,                   -- 擴展元數據
        model_version TEXT,              -- 模型版本追蹤
        normalized BOOLEAN,              -- 正規化標誌
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        CHECK (length(vector) = ${vectorByteSize}) -- 確保${this.config.dimensions}個float32
      );
      
      -- 映射表（用於快速查找）
      CREATE TABLE IF NOT EXISTS mappings (
        doc_id TEXT PRIMARY KEY,
        label INTEGER UNIQUE NOT NULL,
        FOREIGN KEY (doc_id) REFERENCES vectors(doc_id) ON DELETE CASCADE
      );
      
      -- 索引元數據
      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      
      -- 性能索引
      CREATE INDEX IF NOT EXISTS idx_label ON vectors(label);
      CREATE INDEX IF NOT EXISTS idx_updated ON vectors(updated_at);
      CREATE INDEX IF NOT EXISTS idx_model ON vectors(model_version);
      
      -- 插入或更新關鍵元數據
      INSERT OR REPLACE INTO index_metadata VALUES 
        ('model_name', '${this.config.modelName}'),
        ('dimensions', '${this.config.dimensions}'),
        ('space', '${this.config.space}'),
        ('normalized', 'true'),
        ('version', '5.2.1'),
        ('created_at', datetime('now'));
    `;
    
    this.db.exec(schema);
  }
  
  /**
   * 準備預編譯語句以提高性能
   */
  prepareStatements() {
    this.stmts = {
      // 插入或更新向量
      upsertVector: this.db.prepare(`
        INSERT OR REPLACE INTO vectors 
        (doc_id, label, vector, metadata, model_version, normalized, updated_at)
        VALUES (@docId, @label, @vector, @metadata, @modelVersion, @normalized, @updatedAt)
      `),
      
      // 更新映射
      upsertMapping: this.db.prepare(`
        INSERT OR REPLACE INTO mappings (doc_id, label) VALUES (?, ?)
      `),
      
      // 獲取向量
      getVector: this.db.prepare(`
        SELECT vector, metadata FROM vectors WHERE doc_id = ?
      `),
      
      // 獲取標籤
      getLabel: this.db.prepare(`
        SELECT label FROM mappings WHERE doc_id = ?
      `),
      
      // 刪除向量
      removeVector: this.db.prepare(`
        DELETE FROM vectors WHERE doc_id = ?
      `),
      
      // 刪除映射
      removeMapping: this.db.prepare(`
        DELETE FROM mappings WHERE doc_id = ?
      `),
      
      // 批量獲取向量
      batchGetVectors: this.db.prepare(`
        SELECT doc_id, vector, metadata 
        FROM vectors 
        WHERE doc_id IN (SELECT value FROM json_each(?))
      `),
      
      // 獲取統計信息
      getStats: this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(length(vector)) as totalSize,
          MAX(updated_at) as lastUpdate
        FROM vectors
      `),
      
      // 獲取所有映射
      getAllMappings: this.db.prepare(`
        SELECT doc_id, label FROM mappings ORDER BY label
      `)
    };
  }
  
  /**
   * 保存向量和元數據
   * @param {string} docId - 文檔ID
   * @param {number} label - HNSW標籤
   * @param {Float32Array} vector - 向量數據
   * @param {Object} metadata - 元數據
   */
  saveVector(docId, label, vector, metadata = {}) {
    // 驗證向量維度（使用配置的維度，不硬編碼）
    if (!(vector instanceof Float32Array) || vector.length !== this.config.dimensions) {
      throw new Error(`向量必須是${this.config.dimensions}維的Float32Array，實際: ${vector?.length}`);
    }
    
    // 轉換為Buffer
    const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    
    // 使用事務確保一致性
    const transaction = this.db.transaction(() => {
      this.stmts.upsertVector.run({
        docId,
        label,
        vector: buffer,
        metadata: JSON.stringify(metadata),
        modelVersion: this.config.modelName,
        normalized: this.config.space === 'ip' ? 1 : 0,
        updatedAt: Date.now()
      });
      
      this.stmts.upsertMapping.run(docId, label);
    });
    
    transaction();
  }
  
  /**
   * 獲取向量和元數據
   * @param {string} docId - 文檔ID
   * @returns {Object|null} 包含向量和元數據的對象
   */
  getVector(docId) {
    const row = this.stmts.getVector.get(docId);
    if (!row) return null;
    
    // 轉換Buffer回Float32Array
    const buffer = row.vector;
    const vector = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    
    return {
      vector,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }
  
  /**
   * 獲取文檔的HNSW標籤
   * @param {string} docId - 文檔ID
   * @returns {number|null} HNSW標籤
   */
  getLabel(docId) {
    const row = this.stmts.getLabel.get(docId);
    return row?.label ?? null;
  }
  
  /**
   * 獲取所有docId到label的映射
   * @returns {Map<string, number>} 映射表
   */
  getAllMappings() {
    const rows = this.stmts.getAllMappings.all();
    const mappings = new Map();
    for (const row of rows) {
      mappings.set(row.doc_id, row.label);
    }
    return mappings;
  }
  
  /**
   * 批量獲取向量
   * @param {string[]} docIds - 文檔ID數組
   * @returns {Map<string, Object>} 向量映射表
   */
  batchGetVectors(docIds) {
    const docIdsJson = JSON.stringify(docIds);
    const rows = this.stmts.batchGetVectors.all(docIdsJson);
    const vectors = new Map();
    
    for (const row of rows) {
      const buffer = row.vector;
      const vector = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
      vectors.set(row.doc_id, {
        vector,
        metadata: JSON.parse(row.metadata || '{}')
      });
    }
    
    return vectors;
  }
  
  /**
   * 刪除向量
   * @param {string} docId - 文檔ID
   */
  removeVector(docId) {
    const transaction = this.db.transaction(() => {
      this.stmts.removeVector.run(docId);
      this.stmts.removeMapping.run(docId);
    });
    transaction();
  }
  
  /**
   * 獲取統計信息
   * @returns {Object} 統計數據
   */
  getStats() {
    const stats = this.stmts.getStats.get() || {};
    return {
      totalVectors: stats.total || 0,
      sizeBytes: stats.totalSize || 0,
      lastUpdate: stats.lastUpdate || null,
      dimensions: this.config.dimensions,
      modelName: this.config.modelName
    };
  }
  
  /**
   * 清空所有數據
   */
  clear() {
    this.db.exec('DELETE FROM vectors; DELETE FROM mappings;');
  }
  
  /**
   * 優化資料庫
   */
  optimize() {
    this.db.exec('VACUUM; ANALYZE;');
  }
  
  /**
   * 關閉資料庫連接
   */
  close() {
    this.db.close();
  }
}

export default VectorSidecarStore;
