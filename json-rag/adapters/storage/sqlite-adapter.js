/**
 * SQLite存儲適配器
 * 使用better-sqlite3實現高性能本地存儲
 */

import { StoragePort } from '../../core/interfaces.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SQLiteStorageAdapter extends StoragePort {
  constructor(init) {
    super();
    // 支持兩種建構方式：AdapterInit 和舊的 options
    const options = init.config || init;
    
    this.options = {
      dbPath: options.dbPath || path.join(__dirname, '../../data/json-rag.db'),
      readonly: options.readonly || false,
      verbose: options.verbose || false,
      ...options
    };
    
    this.logger = init.logger || console;
    this.db = null;
    this.statements = {};
  }

  /**
   * 初始化適配器
   */
  async initialize() {
    try {
      // 創建資料庫連接
      this.db = new Database(this.options.dbPath, {
        readonly: this.options.readonly,
        verbose: this.options.verbose ? console.log : null
      });

      // 啟用WAL模式以提高並發性能
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = normal');

      // 創建表結構
      this.db.exec(`
        -- 主數據表（JSON-RAG核心）
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          collection TEXT NOT NULL,
          data JSON NOT NULL,
          checksum TEXT,
          created_at INTEGER DEFAULT (unixepoch() * 1000),
          updated_at INTEGER DEFAULT (unixepoch() * 1000),
          accessed_at INTEGER DEFAULT (unixepoch() * 1000)
        );
        
        -- 元數據索引
        CREATE INDEX IF NOT EXISTS idx_collection ON documents(collection);
        CREATE INDEX IF NOT EXISTS idx_updated ON documents(updated_at);
        CREATE INDEX IF NOT EXISTS idx_accessed ON documents(accessed_at);
        
        -- FTS5全文索引（暫時保留，由FTS5適配器實現）
        -- CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(...);
        
        -- 元數據表
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value JSON,
          updated_at INTEGER DEFAULT (unixepoch() * 1000)
        );
      `);

      // 準備預編譯語句
      this.statements = {
        insert: this.db.prepare(`
          INSERT OR REPLACE INTO documents (id, collection, data, checksum, created_at, updated_at, accessed_at)
          VALUES (@id, @collection, @data, @checksum, 
            COALESCE((SELECT created_at FROM documents WHERE id = @id), @created_at),
            @updated_at, @updated_at)
        `),
        
        get: this.db.prepare(`
          SELECT * FROM documents WHERE id = ?
        `),
        
        delete: this.db.prepare(`
          DELETE FROM documents WHERE id = ?
        `),
        
        updateAccessed: this.db.prepare(`
          UPDATE documents SET accessed_at = ? WHERE id = ?
        `),
        
        getMetadata: this.db.prepare(`
          SELECT COUNT(*) as document_count,
                 SUM(LENGTH(data)) as total_size
          FROM documents
        `),
        
        getAllIds: this.db.prepare(`
          SELECT id FROM documents ORDER BY updated_at DESC
        `)
      };

      console.log('[SQLiteStorage] 初始化完成:', this.options.dbPath);
      
    } catch (error) {
      console.error('[SQLiteStorage] 初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 存儲文檔
   */
  async put(key, value) {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      const now = Date.now();
      const data = JSON.stringify(value);
      const checksum = this.calculateChecksum(data);
      
      // 提取collection（key格式為 collection:id）
      const [collection, id] = this.parseKey(key);

      this.statements.insert.run({
        id: key,
        collection: collection || 'default',
        data: data,
        checksum: checksum,
        created_at: value.created_at || now,
        updated_at: value.updated_at || now
      });

    } catch (error) {
      console.error('[SQLiteStorage] 存儲失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取文檔
   */
  async get(key) {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      const row = this.statements.get.get(key);
      
      if (!row) {
        // 記錄調試信息
        this.logger.log(`[SQLiteStorage] Document not found: ${key}`);
        return null;
      }

      // 更新訪問時間
      this.statements.updateAccessed.run(Date.now(), key);

      // 解析並返回文檔
      const doc = JSON.parse(row.data);
      
      // 返回原始的文檔數據，不包裝在額外的 data 屬性中
      return doc;

    } catch (error) {
      console.error('[SQLiteStorage] 獲取失敗:', error);
      return null;
    }
  }

  /**
   * 查詢文檔
   */
  async query(criteria) {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      // 構建動態查詢
      let sql = 'SELECT * FROM documents WHERE 1=1';
      const params = [];

      // 集合過濾
      if (criteria.collection) {
        sql += ' AND collection = ?';
        params.push(criteria.collection);
      }

      // 時間範圍過濾
      if (criteria.timeRange) {
        if (criteria.timeRange.start) {
          sql += ' AND updated_at >= ?';
          params.push(new Date(criteria.timeRange.start).getTime());
        }
        if (criteria.timeRange.end) {
          sql += ' AND updated_at <= ?';
          params.push(new Date(criteria.timeRange.end).getTime());
        }
      }

      // 排序
      if (criteria.orderBy) {
        const validFields = ['created_at', 'updated_at', 'accessed_at'];
        if (validFields.includes(criteria.orderBy.field)) {
          sql += ` ORDER BY ${criteria.orderBy.field} ${criteria.orderBy.direction || 'ASC'}`;
        }
      } else {
        sql += ' ORDER BY updated_at DESC';
      }

      // 限制
      if (criteria.limit) {
        sql += ' LIMIT ?';
        params.push(criteria.limit);
      }

      // 執行查詢
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);

      // 解析結果
      return rows.map(row => ({
        id: row.id,
        collection: row.collection,
        data: JSON.parse(row.data),
        checksum: row.checksum,
        created_at: row.created_at,
        updated_at: row.updated_at,
        accessed_at: row.accessed_at
      }));

    } catch (error) {
      console.error('[SQLiteStorage] 查詢失敗:', error);
      return [];
    }
  }

  /**
   * 批量寫入（使用事務）
   */
  async bulkWrite(operations) {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    const results = [];
    
    // 事務中不能使用async/await，所以先準備所有數據
    const preparedOps = [];
    
    for (const op of operations) {
      if (op.type === 'update') {
        // 預先獲取update需要的現有數據
        const existing = await this.get(op.key);
        preparedOps.push({ ...op, existing });
      } else {
        preparedOps.push(op);
      }
    }
    
    // 使用事務確保原子性
    const bulkInsert = this.db.transaction((ops) => {
      for (const op of ops) {
        try {
          switch (op.type) {
            case 'put': {
              const now = Date.now();
              const data = JSON.stringify(op.value);
              const checksum = this.calculateChecksum(data);
              const [collection, id] = this.parseKey(op.key);
              
              this.statements.insert.run({
                id: op.key,
                collection: collection || 'default',
                data: data,
                checksum: checksum,
                created_at: now,
                updated_at: now
              });
              
              results.push({ success: true, key: op.key });
              break;
            }
              
            case 'delete': {
              const deleted = this.statements.delete.run(op.key);
              results.push({ 
                success: deleted.changes > 0, 
                key: op.key 
              });
              break;
            }
              
            case 'update': {
              if (op.existing) {
                const updated = { ...op.existing.data, ...op.value };
                const now = Date.now();
                const data = JSON.stringify(updated);
                const checksum = this.calculateChecksum(data);
                const [collection, id] = this.parseKey(op.key);
                
                this.statements.insert.run({
                  id: op.key,
                  collection: collection || 'default',
                  data: data,
                  checksum: checksum,
                  created_at: op.existing.created_at,
                  updated_at: now
                });
                
                results.push({ success: true, key: op.key });
              } else {
                results.push({ 
                  success: false, 
                  key: op.key, 
                  error: 'not found' 
                });
              }
              break;
            }
              
            default:
              results.push({ 
                success: false, 
                key: op.key, 
                error: 'unknown operation' 
              });
          }
        } catch (error) {
          results.push({ 
            success: false, 
            key: op.key, 
            error: error.message 
          });
        }
      }
    });

    try {
      bulkInsert(preparedOps);
    } catch (error) {
      console.error('[SQLiteStorage] 批量操作失敗:', error);
    }

    return results;
  }

  /**
   * 創建快照
   */
  async createSnapshot() {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      // 獲取所有文檔
      const allDocs = this.db.prepare('SELECT * FROM documents').all();
      
      const data = {};
      for (const doc of allDocs) {
        data[doc.id] = doc.data;
      }

      const snapshot = {
        id: `snapshot-${Date.now()}`,
        timestamp: Date.now(),
        metadata: await this.getMetadata(),
        data
      };

      return snapshot;

    } catch (error) {
      console.error('[SQLiteStorage] 快照創建失敗:', error);
      throw error;
    }
  }

  /**
   * 刪除文檔
   */
  async delete(key) {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      const result = this.statements.delete.run(key);
      return result.changes > 0;
    } catch (error) {
      console.error('[SQLiteStorage] 刪除失敗:', error);
      return false;
    }
  }

  /**
   * 獲取所有鍵
   */
  async keys() {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      const rows = this.statements.getAllIds.all();
      return rows.map(row => row.id);
    } catch (error) {
      console.error('[SQLiteStorage] 獲取鍵失敗:', error);
      return [];
    }
  }

  /**
   * 獲取元數據
   */
  async getMetadata() {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      const stats = this.statements.getMetadata.get();
      
      return {
        documentCount: stats.document_count || 0,
        totalSize: stats.total_size || 0,
        dbSize: this.db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get().size,
        updated_at: Date.now()
      };

    } catch (error) {
      console.error('[SQLiteStorage] 獲取元數據失敗:', error);
      return {
        documentCount: 0,
        totalSize: 0,
        dbSize: 0,
        updated_at: Date.now()
      };
    }
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return this.getMetadata();
  }

  /**
   * 清空所有數據
   */
  async clear() {
    if (!this.db) {
      throw new Error('資料庫未初始化');
    }

    try {
      this.db.exec('DELETE FROM documents');
      console.log('[SQLiteStorage] 數據已清空');
    } catch (error) {
      console.error('[SQLiteStorage] 清空失敗:', error);
      throw error;
    }
  }

  /**
   * 關閉適配器
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[SQLiteStorage] 已關閉');
    }
  }

  /**
   * 工具方法：計算校驗和
   */
  calculateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 解析鍵
   */
  parseKey(key) {
    const parts = key.split(':');
    if (parts.length >= 2) {
      return [parts[0], parts.slice(1).join(':')];
    }
    return [null, key];
  }
}

// 導出為默認
export default SQLiteStorageAdapter;
