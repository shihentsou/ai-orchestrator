/**
 * SQLite索引適配器
 * 將索引存儲在SQLite中，確保與SQLiteStorageAdapter同步
 */

import { IndexPort } from '../../core/interfaces.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SQLiteIndexAdapter extends IndexPort {
  constructor(init) {
    super();
    const { config, deps, connection, logger } = init;
    
    // 清晰的連接邏輯
    if (connection) {
      this.db = connection;
      this.sharedConnection = true;
    } else if (deps?.storage?.getConnection) {
      this.db = deps.storage.getConnection();
      this.sharedConnection = true;
    } else if (deps?.storage?.db) {
      this.db = deps.storage.db;
      this.sharedConnection = true;
    } else {
      this.dbPath = config.dbPath || path.join(__dirname, '../../data/json-rag.db');
      this.db = null;
      this.sharedConnection = false;
    }
    
    this.logger = logger || console;
    this.statements = {};
  }

  async initialize() {
    try {
      // 如果沒有共享連接，創建自己的連接
      if (!this.db && !this.sharedConnection) {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('temp_store = MEMORY');
      }

      // 創建索引表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS document_index (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          field_name TEXT NOT NULL,
          field_value TEXT,
          field_type TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(document_id, field_name)
        );

        CREATE INDEX IF NOT EXISTS idx_field_name ON document_index(field_name);
        CREATE INDEX IF NOT EXISTS idx_field_value ON document_index(field_value);
        CREATE INDEX IF NOT EXISTS idx_document_id ON document_index(document_id);
      `);

      // 準備常用語句
      this.statements.insert = this.db.prepare(`
        INSERT OR REPLACE INTO document_index 
        (id, document_id, field_name, field_value, field_type) 
        VALUES (?, ?, ?, ?, ?)
      `);

      this.statements.delete = this.db.prepare(`
        DELETE FROM document_index WHERE document_id = ?
      `);

      this.statements.findByField = this.db.prepare(`
        SELECT DISTINCT document_id FROM document_index 
        WHERE field_name = ? AND field_value = ?
      `);

      this.statements.findById = this.db.prepare(`
        SELECT * FROM document_index WHERE document_id = ?
      `);

      this.statements.countByDocument = this.db.prepare(`
        SELECT COUNT(*) as count FROM document_index WHERE document_id = ?
      `);

      this.logger.log('[SQLiteIndexAdapter] Initialized successfully');
    } catch (error) {
      this.logger.error('[SQLiteIndexAdapter] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 提取並索引文檔中的可索引字段
   */
  extractIndexableFields(document) {
    const fields = [];
    
    // 基本字段
    if (document.id) {
      fields.push({
        name: 'id',
        value: document.id,
        type: 'string'
      });
    }

    if (document.collection) {
      fields.push({
        name: 'collection',
        value: document.collection,
        type: 'string'
      });
    }

    if (document.type) {
      fields.push({
        name: 'type',
        value: document.type,
        type: 'string'
      });
    }

    // 遞歸提取 data 對象中的字段
    if (document.data && typeof document.data === 'object') {
      this.extractFieldsFromObject(document.data, 'data', fields);
    }

    // 提取 metadata
    if (document.metadata && typeof document.metadata === 'object') {
      this.extractFieldsFromObject(document.metadata, 'metadata', fields);
    }

    return fields;
  }

  /**
   * 遞歸提取對象中的字段
   */
  extractFieldsFromObject(obj, prefix, fields, maxDepth = 3, currentDepth = 0) {
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
          fields.push({
            name: fieldName,
            value: value.join(','),
            type: 'array'
          });
        }
      } else if (typeof value === 'object') {
        // 遞歸處理嵌套對象
        this.extractFieldsFromObject(value, fieldName, fields, maxDepth, currentDepth + 1);
      } else {
        // 基本類型
        fields.push({
          name: fieldName,
          value: String(value),
          type: typeof value
        });
      }
    }
  }

  async addDocument(documentId, document) {
    try {
      // 先刪除舊的索引
      await this.removeDocument(documentId);

      // 提取可索引字段
      const fields = this.extractIndexableFields(document);

      // 批量插入索引
      const insertMany = this.db.transaction((fields) => {
        for (const field of fields) {
          const indexId = `${documentId}:${field.name}`;
          this.statements.insert.run(
            indexId,
            documentId,
            field.name,
            field.value,
            field.type
          );
        }
      });

      insertMany(fields);

      // 驗證索引是否創建成功
      const count = this.statements.countByDocument.get(documentId);
      if (count.count === 0) {
        throw new Error(`Failed to create index for document ${documentId}`);
      }

      this.logger.log(`[SQLiteIndexAdapter] Indexed document ${documentId} with ${fields.length} fields`);
    } catch (error) {
      this.logger.error(`[SQLiteIndexAdapter] Failed to index document ${documentId}:`, error);
      throw error;
    }
  }

  async removeDocument(documentId) {
    try {
      const result = this.statements.delete.run(documentId);
      if (result.changes > 0) {
        this.logger.log(`[SQLiteIndexAdapter] Removed index for document ${documentId}`);
      }
    } catch (error) {
      this.logger.error(`[SQLiteIndexAdapter] Failed to remove document ${documentId}:`, error);
      throw error;
    }
  }

  async findByIndex(fieldName, fieldValue) {
    try {
      const rows = this.statements.findByField.all(fieldName, String(fieldValue));
      return rows.map(row => row.document_id);
    } catch (error) {
      this.logger.error(`[SQLiteIndexAdapter] Failed to find by index ${fieldName}=${fieldValue}:`, error);
      throw error;
    }
  }

  async getIndexedFields(documentId) {
    try {
      const rows = this.statements.findById.all(documentId);
      return rows.map(row => ({
        name: row.field_name,
        value: row.field_value,
        type: row.field_type
      }));
    } catch (error) {
      this.logger.error(`[SQLiteIndexAdapter] Failed to get indexed fields for ${documentId}:`, error);
      throw error;
    }
  }

  async rebuild(getAllDocuments) {
    this.logger.log('[SQLiteIndexAdapter] Starting index rebuild...');
    const startTime = Date.now();

    try {
      // 清空索引表
      this.db.exec('DELETE FROM document_index');

      // 獲取所有文檔並重新索引
      const documents = await getAllDocuments();
      let count = 0;

      const rebuildTransaction = this.db.transaction((documents) => {
        for (const doc of documents) {
          const fields = this.extractIndexableFields(doc);
          for (const field of fields) {
            const indexId = `${doc.id}:${field.name}`;
            this.statements.insert.run(
              indexId,
              doc.id,
              field.name,
              field.value,
              field.type
            );
          }
          count++;

          if (count % 1000 === 0) {
            this.logger.log(`[SQLiteIndexAdapter] Indexed ${count} documents...`);
          }
        }
      });

      rebuildTransaction(documents);

      const elapsed = Date.now() - startTime;
      this.logger.log(`[SQLiteIndexAdapter] Rebuild completed: ${count} documents in ${elapsed}ms`);

      return { count, elapsed };
    } catch (error) {
      this.logger.error('[SQLiteIndexAdapter] Rebuild failed:', error);
      throw error;
    }
  }

  async query(criteria) {
    try {
      // 簡單實現：只支持 AND 查詢
      const conditions = [];
      const params = [];

      if (criteria.collection) {
        conditions.push(`
          document_id IN (
            SELECT document_id FROM document_index 
            WHERE field_name = 'collection' AND field_value = ?
          )
        `);
        params.push(criteria.collection);
      }

      if (criteria.type) {
        conditions.push(`
          document_id IN (
            SELECT document_id FROM document_index 
            WHERE field_name = 'type' AND field_value = ?
          )
        `);
        params.push(criteria.type);
      }

      // 支持任意字段查詢
      for (const [key, value] of Object.entries(criteria)) {
        if (key !== 'collection' && key !== 'type') {
          conditions.push(`
            document_id IN (
              SELECT document_id FROM document_index 
              WHERE field_name = ? AND field_value = ?
            )
          `);
          params.push(key, String(value));
        }
      }

      if (conditions.length === 0) {
        return [];
      }

      const sql = `
        SELECT DISTINCT document_id 
        FROM document_index 
        WHERE ${conditions.join(' AND ')}
      `;

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return rows.map(row => row.document_id);
    } catch (error) {
      this.logger.error('[SQLiteIndexAdapter] Query failed:', error);
      throw error;
    }
  }

  async clear() {
    try {
      this.db.exec('DELETE FROM document_index');
      this.logger.log('[SQLiteIndexAdapter] Index cleared');
    } catch (error) {
      this.logger.error('[SQLiteIndexAdapter] Failed to clear index:', error);
      throw error;
    }
  }

  async close() {
    try {
      // 只有非共享連接才需要關閉
      if (!this.sharedConnection && this.db) {
        this.db.close();
        this.logger.log('[SQLiteIndexAdapter] Connection closed');
      }
    } catch (error) {
      this.logger.error('[SQLiteIndexAdapter] Failed to close connection:', error);
      throw error;
    }
  }

  /**
   * 獲取統計信息
   */
  async getStats() {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT document_id) as document_count,
          COUNT(*) as index_entry_count,
          COUNT(DISTINCT field_name) as unique_field_count
        FROM document_index
      `).get();

      return stats;
    } catch (error) {
      this.logger.error('[SQLiteIndexAdapter] Failed to get stats:', error);
      throw error;
    }
  }

  
  /**
   * 釋放資源
   */
  async dispose() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.statements = {};
    console.log('[SQLite] Disposed');
  }
  
  /**
   * 從全文搜索中移除文檔
   * @param {string} docId - 文檔ID
   * @param {string} collection - 集合名稱
   */
  async removeFromFTS(docId, collection = 'default') {
    if (!this.db) this.initialize();
    
    const stmt = this.db.prepare(`
      DELETE FROM documents 
      WHERE doc_id = ? AND collection = ?
    `);
    
    stmt.run(docId, collection);
    console.log(`[SQLite] Removed from FTS: ${docId}`);
  }

}