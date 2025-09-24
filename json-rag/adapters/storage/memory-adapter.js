/**
 * 內存存儲適配器
 * 用於開發、測試和小規模數據
 */

import { StoragePort } from '../../core/interfaces.js';

export class MemoryStorageAdapter extends StoragePort {
  constructor(options = {}) {
    super();
    this.options = {
      maxSize: 100 * 1024 * 1024, // 100MB
      ...options
    };
    
    this.store = new Map();
    this.metadata = {
      documentCount: 0,
      totalSize: 0,
      created_at: Date.now(),
      updated_at: Date.now()
    };
  }

  /**
   * 初始化適配器
   */
  async initialize() {
    // 內存適配器無需初始化
    console.log('[MemoryStorage] 初始化完成');
  }

  /**
   * 存儲文檔
   */
  async put(key, value) {
    const serialized = JSON.stringify(value);
    const size = new Blob([serialized]).size;

    // 檢查大小限制
    if (this.metadata.totalSize + size > this.options.maxSize) {
      throw new Error('內存存儲空間不足');
    }

    // 更新或新增
    const isNew = !this.store.has(key);
    const oldSize = isNew ? 0 : new Blob([this.store.get(key)]).size;

    this.store.set(key, serialized);

    // 更新元數據
    if (isNew) {
      this.metadata.documentCount++;
    }
    this.metadata.totalSize += (size - oldSize);
    this.metadata.updated_at = Date.now();
  }

  /**
   * 獲取文檔
   */
  async get(key) {
    const serialized = this.store.get(key);
    if (!serialized) {
      return null;
    }

    try {
      return JSON.parse(serialized);
    } catch (error) {
      console.error('[MemoryStorage] 解析文檔失敗:', key, error);
      return null;
    }
  }

  /**
   * 查詢文檔
   */
  async query(criteria) {
    const results = [];

    // 遍歷所有文檔
    for (const [key, value] of this.store.entries()) {
      try {
        const doc = JSON.parse(value);
        
        // 應用過濾條件
        if (this.matchesCriteria(doc, criteria)) {
          results.push(doc);
        }
      } catch (error) {
        console.error('[MemoryStorage] 查詢時解析失敗:', key, error);
      }
    }

    // 排序（如果需要）
    if (criteria.orderBy) {
      results.sort((a, b) => {
        const aVal = this.getFieldValue(a, criteria.orderBy.field);
        const bVal = this.getFieldValue(b, criteria.orderBy.field);
        const order = criteria.orderBy.direction === 'desc' ? -1 : 1;
        
        if (aVal < bVal) return -order;
        if (aVal > bVal) return order;
        return 0;
      });
    }

    // 應用限制
    if (criteria.limit) {
      return results.slice(0, criteria.limit);
    }

    return results;
  }

  /**
   * 批量寫入
   */
  async bulkWrite(operations) {
    const results = [];

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'put':
            await this.put(op.key, op.value);
            results.push({ success: true, key: op.key });
            break;
            
          case 'delete':
            await this.delete(op.key);
            results.push({ success: true, key: op.key });
            break;
            
          case 'update':
            const existing = await this.get(op.key);
            if (existing) {
              const updated = { ...existing, ...op.value };
              await this.put(op.key, updated);
              results.push({ success: true, key: op.key });
            } else {
              results.push({ success: false, key: op.key, error: 'not found' });
            }
            break;
            
          default:
            results.push({ success: false, key: op.key, error: 'unknown operation' });
        }
      } catch (error) {
        results.push({ success: false, key: op.key, error: error.message });
      }
    }

    return results;
  }

  /**
   * 創建快照
   */
  async createSnapshot() {
    const data = {};
    
    // 複製所有數據
    for (const [key, value] of this.store.entries()) {
      data[key] = value;
    }

    const snapshot = {
      id: `snapshot-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        ...this.metadata,
        checksum: await this.calculateChecksum(data)
      },
      data
    };

    return snapshot;
  }

  /**
   * 刪除文檔
   */
  async delete(key) {
    if (!this.store.has(key)) {
      return false;
    }

    const size = new Blob([this.store.get(key)]).size;
    this.store.delete(key);

    // 更新元數據
    this.metadata.documentCount--;
    this.metadata.totalSize -= size;
    this.metadata.updated_at = Date.now();

    return true;
  }

  /**
   * 獲取元數據
   */
  async getMetadata() {
    return { ...this.metadata };
  }

  /**
   * 檢查文檔是否匹配查詢條件
   */
  matchesCriteria(doc, criteria) {
    // 集合過濾
    if (criteria.collection && doc.collection !== criteria.collection) {
      return false;
    }

    // 時間範圍過濾
    if (criteria.timeRange) {
      const timestamp = doc.updated_at || doc.created_at;
      if (criteria.timeRange.start && timestamp < new Date(criteria.timeRange.start).getTime()) {
        return false;
      }
      if (criteria.timeRange.end && timestamp > new Date(criteria.timeRange.end).getTime()) {
        return false;
      }
    }

    // 標籤過濾
    if (criteria.tags && criteria.tags.length > 0) {
      if (!doc.tags || !Array.isArray(doc.tags)) {
        return false;
      }
      const hasAllTags = criteria.tags.every(tag => doc.tags.includes(tag));
      if (!hasAllTags) {
        return false;
      }
    }

    // 元數據過濾
    if (criteria.metadata) {
      for (const [key, value] of Object.entries(criteria.metadata)) {
        if (this.getFieldValue(doc, key) !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 獲取嵌套字段值
   */
  getFieldValue(obj, path) {
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
   * 計算校驗和
   */
  async calculateChecksum(data) {
    const text = JSON.stringify(data);
    const encoder = new TextEncoder();
    const data_uint8 = encoder.encode(text);
    
    // 在Node.js環境中使用crypto
    if (typeof global !== 'undefined' && global.crypto) {
      const hashBuffer = await global.crypto.subtle.digest('SHA-256', data_uint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // 在瀏覽器環境中
    if (typeof window !== 'undefined' && window.crypto) {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data_uint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // 降級：簡單的哈希
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 清空所有數據
   */
  async clear() {
    this.store.clear();
    this.metadata = {
      documentCount: 0,
      totalSize: 0,
      created_at: Date.now(),
      updated_at: Date.now()
    };
  }

  /**
   * 獲取所有鍵
   */
  async keys() {
    return Array.from(this.store.keys());
  }

  /**
   * 獲取存儲統計
   */
  getStats() {
    return {
      documentCount: this.metadata.documentCount,
      totalSize: this.metadata.totalSize,
      usedMemory: process.memoryUsage ? process.memoryUsage().heapUsed : 0,
      maxSize: this.options.maxSize
    };
  }

  /**
   * 關閉適配器
   */
  async close() {
    // 內存適配器無需關閉
    console.log('[MemoryStorage] 已關閉');
  }
}

// 導出為默認
export default MemoryStorageAdapter;
