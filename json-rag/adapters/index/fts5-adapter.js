// adapters/index/fts5-adapter-fix2.js
// SQLite FTS5 全文搜索適配器實現（支援中文分詞）- 第二次修復

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { IndexPort } from '../../core/interfaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class FTS5IndexAdapter extends IndexPort {
  constructor(init) {
    super();
    const { config = {}, deps, connection, logger } = init || {};
    
    // 連接管理
    if (connection) {
      this.db = connection;
      this.sharedConnection = true;
    } else if (deps?.storage?.getConnection) {
      this.db = deps.storage.getConnection();
      this.sharedConnection = true;
    } else {
      this.dbPath = config.dbPath || path.join(__dirname, '../../data/json-rag.db');
      this.db = null;
      this.sharedConnection = false;
    }
    
    this.logger = logger || console;
    this.tableName = config.tableName || 'documents_fts';
    this.statements = {};
    this.enableChinese = config.enableChinese !== false; // 預設啟用中文支援
  }
  
  async initialize() {
    try {
      if (!this.db && !this.sharedConnection) {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('temp_store = MEMORY');
      }
      
      // 創建 FTS5 表（根據是否需要中文支援選擇分詞器）
      const tokenizer = this.enableChinese ? 'unicode61' : 'porter';
      
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}
        USING fts5(
          id UNINDEXED,
          collection UNINDEXED,
          content,
          metadata UNINDEXED,
          tokenize = '${tokenizer}'
        );
      `);
      
      // 準備語句
      this.statements.insert = this.db.prepare(`
        INSERT OR REPLACE INTO ${this.tableName} (id, collection, content, metadata)
        VALUES (?, ?, ?, ?)
      `);
      
      this.statements.delete = this.db.prepare(`
        DELETE FROM ${this.tableName} WHERE id = ?
      `);
      
      this.statements.search = this.db.prepare(`
        SELECT 
          id,
          collection,
          snippet(${this.tableName}, 2, '<b>', '</b>', '...', 30) as snippet,
          bm25(${this.tableName}) as score,
          metadata
        FROM ${this.tableName}
        WHERE ${this.tableName} MATCH ?
        ORDER BY score
        LIMIT ? OFFSET ?
      `);
      
      this.statements.searchWithCollection = this.db.prepare(`
        SELECT 
          id,
          collection,
          snippet(${this.tableName}, 2, '<b>', '</b>', '...', 30) as snippet,
          bm25(${this.tableName}) as score,
          metadata
        FROM ${this.tableName}
        WHERE collection = ? AND ${this.tableName} MATCH ?
        ORDER BY score
        LIMIT ? OFFSET ?
      `);
      
      this.statements.getById = this.db.prepare(`
        SELECT * FROM ${this.tableName} WHERE id = ?
      `);
      
      this.statements.clearCollection = this.db.prepare(`
        DELETE FROM ${this.tableName} WHERE collection = ?
      `);
      
      this.logger.log('[FTS5] Adapter initialized' + (this.enableChinese ? ' with Chinese support' : ''));
    } catch (error) {
      this.logger.error('[FTS5] Initialization failed:', error);
      throw error;
    }
  }
  
  // ========== IndexPort 接口實現 ==========
  
  /**
   * 添加到全文搜索（IndexPort 要求的方法）
   * @param {string} docId - 文檔ID
   * @param {string} content - 文檔內容
   * @returns {Promise<void>}
   */
  async addToFTS(docId, content) {
    try {
      // 解析collection和ID
      let collection = 'default';
      let actualId = docId;
      
      if (docId.includes(':')) {
        const parts = docId.split(':');
        collection = parts[0];
        actualId = parts.slice(1).join(':');
      }
      
      // 關鍵：先刪除舊記錄，避免重複
      if (this.statements.delete) {
        this.statements.delete.run(actualId);
        this.logger.log(`[FTS5] Deleted old record for: ${actualId}`);
      }
      
      // 處理內容
      const processedContent = this.enableChinese 
        ? this.preprocessChinese(content) 
        : content;
      
      // 插入新記錄
      this.statements.insert.run(
        actualId,
        collection,
        processedContent,
        '{}'
      );
      
      this.logger.log(`[FTS5] Updated document: ${actualId} in collection: ${collection}`);
    } catch (error) {
      this.logger.error('[FTS5] AddToFTS failed:', error);
      throw error;
    }
  }
  
  /**
   * 全文搜索（IndexPort 要求的方法）
   * @param {string} query - 搜索查詢
   * @param {SearchOptions} options - 搜索選項
   * @returns {Promise<Result[]>}
   */
  async searchFTS(query, options = {}) {
    return await this.search(query, options);
  }
  
  /**
   * 從全文索引移除（IndexPort 可選方法）
   * @param {string} docId - 文檔ID
   * @returns {Promise<void>}
   */
  async removeFromFTS(docId) {
    // 處理可能帶collection前綴的ID
    let actualId = docId;
    if (docId.includes(':')) {
      const parts = docId.split(':');
      actualId = parts.slice(1).join(':');
    }
    await this.removeDocument(actualId);
  }
  
  // ========== 原有的方法（保持兼容性）==========
  
  /**
   * 添加文檔（支持多種參數格式）
   * @param {string} idOrDocId - 文檔ID
   * @param {Object|string} docOrCollection - 文檔對象或集合名稱
   * @param {string} [content] - 文檔內容（當使用4參數格式時）
   * @param {Object} [metadata] - 元數據（當使用4參數格式時）
   */
  async addDocument(idOrDocId, docOrCollection, content, metadata) {
    try {
      // 判斷調用格式
      if (arguments.length === 4) {
        // 4參數格式：(docId, collection, content, metadata)
        const docId = idOrDocId;
        const collection = docOrCollection;
        const processedContent = this.enableChinese ? this.preprocessChinese(content) : content;
        const metadataStr = JSON.stringify(metadata || {});
        
        console.log(`[FTS5] Adding document (4 params): ${docId}, collection: ${collection}`);
        
        this.statements.insert.run(
          docId,
          collection,
          processedContent,
          metadataStr
        );
      } else if (arguments.length === 2) {
        // 2參數格式：(id, doc)
        const id = idOrDocId;
        const doc = docOrCollection;
        const content = this.extractContent(doc);
        const processedContent = this.enableChinese ? this.preprocessChinese(content) : content;
        const metadataStr = JSON.stringify(doc.metadata || {});
        
        console.log(`[FTS5] Adding document (2 params): ${id}, collection: ${doc.collection || 'default'}`);
        
        this.statements.insert.run(
          id,
          doc.collection || 'default',
          processedContent,
          metadataStr
        );
      } else {
        throw new Error('Invalid number of arguments for addDocument');
      }
    } catch (error) {
      this.logger.error('[FTS5] Add document failed:', error);
      throw error;
    }
  }
  
  async removeDocument(id) {
    try {
      this.statements.delete.run(id);
    } catch (error) {
      this.logger.error('[FTS5] Remove document failed:', error);
      throw error;
    }
  }
  
  async updateDocument(id, doc) {
    // FTS5 使用 INSERT OR REPLACE
    await this.addDocument(id, doc);
  }
  
  async search(query, options = {}) {
    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const collection = options.collection;
      
      // 處理查詢（支援中文）
      const processedQuery = this.processSearchQuery(query);
      
      console.log(`[FTS5] Search: "${query}" -> "${processedQuery}"`);
      
      // 如果查詢為空，返回所有文檔
      if (!processedQuery) {
        const sql = collection
          ? `SELECT id, collection, '' as snippet, 0 as score, metadata FROM ${this.tableName} WHERE collection = ? LIMIT ? OFFSET ?`
          : `SELECT id, collection, '' as snippet, 0 as score, metadata FROM ${this.tableName} LIMIT ? OFFSET ?`;
        
        const stmt = this.db.prepare(sql);
        const results = collection 
          ? stmt.all(collection, limit, offset)
          : stmt.all(limit, offset);
        
        console.log(`[FTS5] Empty query, returning all docs: ${results.length}`);
        
        return results.map(row => ({
          documentId: row.id,  // 為了兼容性，同時提供 documentId
          id: row.id,
          collection: row.collection,
          snippet: row.snippet,
          score: row.score,
          metadata: JSON.parse(row.metadata || '{}')
        }));
      }
      
      let results;
      if (collection) {
        results = this.statements.searchWithCollection.all(
          collection, 
          processedQuery, 
          limit, 
          offset
        );
      } else {
        results = this.statements.search.all(processedQuery, limit, offset);
      }
      
      console.log(`[FTS5] Search results: ${results.length}`);
      
      return results.map(row => ({
        documentId: row.id,  // 為了兼容性，同時提供 documentId
        id: row.id,
        collection: row.collection,
        snippet: row.snippet,
        score: row.score,
        metadata: JSON.parse(row.metadata || '{}')
      }));
    } catch (error) {
      this.logger.error('[FTS5] Search failed:', error);
      console.error('[FTS5] Search error:', error);
      return [];
    }
  }
  
  async clear() {
    try {
      this.db.exec(`DELETE FROM ${this.tableName}`);
    } catch (error) {
      this.logger.error('[FTS5] Clear failed:', error);
      throw error;
    }
  }
  
  async clearCollection(collection) {
    try {
      this.statements.clearCollection.run(collection);
    } catch (error) {
      this.logger.error('[FTS5] Clear collection failed:', error);
      throw error;
    }
  }
  
  async close() {
    try {
      // 關閉所有預備語句
      Object.values(this.statements).forEach(stmt => {
        if (stmt && typeof stmt.finalize === 'function') {
          stmt.finalize();
        }
      });
      
      // 如果不是共享連接，關閉資料庫
      if (!this.sharedConnection && this.db) {
        this.db.close();
      }
    } catch (error) {
      this.logger.error('[FTS5] Close failed:', error);
    }
  }
  
  // ========== 輔助方法 ==========
  
  extractContent(doc) {
    const texts = [];
    
    // 提取所有文本內容
    const extract = (obj) => {
      if (typeof obj === 'string') {
        texts.push(obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(extract);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(extract);
      }
    };
    
    extract(doc);
    return texts.join(' ');
  }
  
  preprocessChinese(text) {
    if (!text) return '';
    
    // 在中文字符之間添加空格以幫助 unicode61 分詞器
    return text.replace(/([\u4e00-\u9fa5])/g, ' $1 ').trim();
  }
  
  processSearchQuery(query) {
    if (!query || query.trim() === '') {
      return '';
    }
    
    // FTS5 不支援單獨的 '*' 查詢
    if (query.trim() === '*') {
      return '';
    }
    
    // 處理連字符（避免被解釋為減號）
    // 將連字符替換為空格或引號包圍
    query = query.replace(/(\w+)-(\w+)/g, '"$1-$2"');
    
    // 處理中文查詢
    if (this.enableChinese) {
      query = this.preprocessChinese(query);
    }
    
    // 移除可能導致語法錯誤的特殊字符，但保留 FTS5 操作符和引號
    query = query.replace(/[^\w\s\u4e00-\u9fa5\-\*\"\(\)]/g, ' ');
    
    return query.trim();
  }
  
  // ========== 高級功能（修復方法名）==========
  
  // 同時提供兩個方法名以保持兼容性
  async advancedSearch(query, options = {}) {
    return await this.searchAdvanced(query, options);
  }
  
  async searchAdvanced(query, options = {}) {
    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const highlight = options.highlight !== false;
      const includeScore = options.includeScore !== false;
      
      // 構建動態 SQL
      const selectClauses = ['id', 'collection'];
      
      if (highlight) {
        const highlightConfig = options.highlightConfig || {
          startTag: '<mark>',
          endTag: '</mark>',
          ellipsis: '...',
          snippetSize: 30
        };
        
        selectClauses.push(
          `snippet(${this.tableName}, 2, '${highlightConfig.startTag}', ` +
          `'${highlightConfig.endTag}', '${highlightConfig.ellipsis}', ` +
          `${highlightConfig.snippetSize}) as snippet`
        );
      }
      
      if (includeScore) {
        selectClauses.push(`bm25(${this.tableName}) as score`);
      }
      
      selectClauses.push('metadata');
      
      const sql = `
        SELECT ${selectClauses.join(', ')}
        FROM ${this.tableName}
        WHERE ${this.tableName} MATCH ?
        ${includeScore ? 'ORDER BY score' : ''}
        LIMIT ? OFFSET ?
      `;
      
      const stmt = this.db.prepare(sql);
      const processedQuery = this.processSearchQuery(query);
      
      if (!processedQuery) {
        // 空查詢處理
        const allSql = `
          SELECT ${selectClauses.join(', ')}
          FROM ${this.tableName}
          LIMIT ? OFFSET ?
        `;
        const allStmt = this.db.prepare(allSql);
        const results = allStmt.all(limit, offset);
        
        return results.map(row => {
          const result = {
            id: row.id,
            collection: row.collection,
            metadata: JSON.parse(row.metadata || '{}')
          };
          
          if (highlight && row.snippet) {
            result.snippet = row.snippet;
          }
          
          if (includeScore && row.score !== undefined) {
            result.score = row.score;
          }
          
          return result;
        });
      }
      
      const results = stmt.all(processedQuery, limit, offset);
      
      return results.map(row => {
        const result = {
          id: row.id,
          collection: row.collection,
          metadata: JSON.parse(row.metadata || '{}')
        };
        
        if (highlight && row.snippet) {
          result.snippet = row.snippet;
        }
        
        if (includeScore && row.score !== undefined) {
          result.score = row.score;
        }
        
        return result;
      });
    } catch (error) {
      this.logger.error('[FTS5] Advanced search failed:', error);
      return [];
    }
  }
  
  async getSearchStats(query) {
    try {
      const processedQuery = this.processSearchQuery(query);
      
      if (!processedQuery) {
        const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM ${this.tableName}`);
        const count = countStmt.get();
        return {
          total: count.total,
          avgScore: 0,
          minScore: 0,
          maxScore: 0
        };
      }
      
      // 分兩步執行：先獲取結果，再計算統計
      const results = this.db.prepare(`
        SELECT bm25(${this.tableName}) as score
        FROM ${this.tableName}
        WHERE ${this.tableName} MATCH ?
      `).all(processedQuery);
      
      if (results.length === 0) {
        return {
          total: 0,
          avgScore: 0,
          minScore: 0,
          maxScore: 0
        };
      }
      
      const scores = results.map(r => r.score);
      const total = scores.length;
      const avgScore = scores.reduce((sum, s) => sum + s, 0) / total;
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      
      return {
        total,
        avgScore,
        minScore,
        maxScore
      };
    } catch (error) {
      this.logger.error('[FTS5] Get stats failed:', error);
      return {
        total: 0,
        avgScore: 0,
        minScore: 0,
        maxScore: 0
      };
    }
  }
  
  /**
   * FTS5搜索方法 - v5.2.1修復版
   */
  async searchFTS(query, options = {}) {
    const limit = options.limit || 20;
    const collection = options.collection;
    
    // 處理查詢字符串 - 使用正確的方法名
    const processedQuery = this.processSearchQuery(query);
    console.log(`[FTS5] Search: "${query}" -> "${processedQuery}"`);
    
    let sql;
    let params;
    
    if (collection) {
      sql = `
        SELECT id, collection, 
               snippet(documents_fts, 2, '<b>', '</b>', '...', 30) as snippet,
               rank * -1 as score
        FROM documents_fts
        WHERE collection = ? AND documents_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [collection, processedQuery, limit];
    } else {
      sql = `
        SELECT id, collection, 
               snippet(documents_fts, 2, '<b>', '</b>', '...', 30) as snippet,
               rank * -1 as score
        FROM documents_fts
        WHERE documents_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [processedQuery, limit];
    }
    
    try {
      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params);
      
      console.log(`[FTS5] Search results: ${results.length}`);
      
      // 去重處理
      const seen = new Set();
      const uniqueResults = [];
      
      for (const result of results) {
        const key = `${result.collection}:${result.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push({
            ...result,
            documentId: result.id, // 添加documentId別名
            metadata: { title: null } // 預留metadata
          });
        } else {
          console.log(`  ❌ 發現重複ID！跳過: ${key}`);
        }
      }
      
      return uniqueResults;
    } catch (error) {
      console.error('[FTS5] Search error:', error);
      return [];
    }
  }
  
  /**
   * 獲取索引統計信息
   */
  async getStats() {
    try {
      const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
      const count = countStmt.get();
      
      return {
        documentCount: count.count,
        tableName: this.tableName,
        enableChinese: this.enableChinese
      };
    } catch (error) {
      this.logger.error('[FTS5] Get stats failed:', error);
      return {
        documentCount: 0,
        tableName: this.tableName,
        enableChinese: this.enableChinese
      };
    }
  }
  
  /**
   * 釋放資源（契約要求的方法）
   */
  async dispose() {
    try {
      // 如果存在close方法，調用它
      if (this.close) {
        return this.close();
      }
      
      // 否則手動關閉
      if (!this.sharedConnection && this.db) {
        this.db.close();
        this.db = null;
      }
      
      // 清理準備語句
      this.statements = {};
      
      this.logger.log('[FTS5] Disposed');
    } catch (error) {
      this.logger.error('[FTS5] Dispose error:', error);
    }
  }

  // ========== 契約相容性補丁 FTS5-DISPOSE ==========

  /**
   * 釋放資源（契約要求的方法）
   */
  async dispose() {
    try {
      // 關閉資料庫連接
      if (!this.sharedConnection && this.db) {
        this.db.close();
        this.db = null;
      }
      // 清理準備語句
      this.statements = {};
      this.logger.log('[FTS5] Disposed');
    } catch (error) {
      this.logger.error('[FTS5] Dispose error:', error);
    }
  }
}

// 導出為默認
export default FTS5IndexAdapter;
