// adapters/index/hnswlib-adapter.js
// HNSW向量索引適配器 - 持久化實現 (v5.2.1修復版 with GPT-5 Windows fix)
// 2025-09-18 - 整合GPT-5的Windows向量持久化解決方案

import { IndexPort } from '../../core/interfaces.js';
import VectorSidecarStore from './sidecar-store.js';
import WindowsSafeVectorManagerFixed from './windows-safe-vector-fixed.js';
import { promises as fsPromises, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync, openSync, fsyncSync, closeSync } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * HNSWLib向量索引適配器
 * 使用hnswlib-node實現高效的k-NN搜索
 * 配合側車存儲解決向量持久化問題
 * 重要：嚴格遵循契約定義，所有Float32Array必須轉換為Array
 * Windows平台使用GPT-5的Generation模式解決EPERM問題
 */
export default class HNSWLibAdapter extends IndexPort {
  constructor(config = {}) {
    super();
    
    this.config = {
      dimensions: config.dimensions || 384,
      space: config.space || 'ip',              // 'ip'(內積), 'l2'(歐氏距離), 'cosine'(餘弦)
      maxElements: config.maxElements || 1000000,
      m: config.m || 16,                        // 圖的連接度
      efConstruction: config.efConstruction || 200,  // 構建時的搜索寬度
      efSearch: config.efSearch || 50,          // 搜索時的寬度
      indexPath: config.indexPath || './data/vector_index.hnsw',
      sidecarPath: config.sidecarPath || './data/vector_sidecar.db',
      seed: config.seed || 100,                 // 隨機種子
      autoSave: config.autoSave !== false,      // 自動保存
      autoSaveInterval: config.autoSaveInterval || 60000  // 自動保存間隔（毫秒）
    };
    
    this.index = null;
    this.sidecar = null;
    this.HierarchicalNSW = null;  // 動態加載的HNSW類
    this.docIdToLabel = new Map();
    this.labelToDocId = new Map();
    this.nextLabel = 0;
    this.initialized = false;
    this.isDirty = false;
    this.autoSaveTimer = null;
    this.searchKnnFormat = 'unknown'; // 用於適配不同版本的返回格式
    this.windowsSafeManager = null; // Windows平台的Generation管理器
  }
  
  /**
   * 初始化索引
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // 動態導入hnswlib-node
      const hnswlibModule = await import('hnswlib-node');
      // hnswlib-node 導出的是 default 對象，裡面包含 HierarchicalNSW
      this.HierarchicalNSW = hnswlibModule.default.HierarchicalNSW;
      
      // 確保目錄存在
      const indexDir = path.dirname(this.config.indexPath);
      if (!existsSync(indexDir)) {
        mkdirSync(indexDir, { recursive: true });
      }
      
      // Windows平台特殊處理：檢查Generation模式
      if (process.platform === 'win32') {
        this.windowsSafeManager = new WindowsSafeVectorManagerFixed({
          baseDir: path.join(indexDir, `.${path.basename(this.config.indexPath, '.hnsw')}-generations`),
          stem: path.basename(this.config.indexPath, '.hnsw'),
          keep: 3,
          backoff: [10, 20, 50, 100, 200]
        });
        await this.windowsSafeManager.init();
        
        // 檢查是否有CURRENT指向的索引
        const currentPath = await this.windowsSafeManager.resolveCurrentIndexPath();
        if (currentPath && existsSync(currentPath)) {
          console.log('[Windows] 使用Generation模式載入索引:', currentPath);
          await this.loadIndex(currentPath);
        } else if (existsSync(this.config.indexPath)) {
          // 兼容舊索引
          await this.loadIndex();
        } else {
          await this.createNewIndex();
        }
      } else {
        // Linux/Mac使用原有邏輯
        const indexExists = existsSync(this.config.indexPath);
        if (indexExists) {
          await this.loadIndex();
        } else {
          await this.createNewIndex();
        }
      }
      
      // 執行啟動自檢（GPT-5建議）
      await this.performStartupChecks();
      
      // 設置自動保存
      if (this.config.autoSave) {
        this.startAutoSave();
      }
      
      this.initialized = true;
      console.log(`✅ HNSWLibAdapter 初始化完成`);
      
    } catch (error) {
      console.error('❌ HNSWLibAdapter 初始化失敗:', error);
      throw new Error(`無法初始化HNSW索引: ${error.message}`);
    }
  }
  
  /**
   * 啟動自檢（GPT-5建議）
   * @private
   */
  async performStartupChecks() {
    // 檢查API方法存在性
    const requiredMethods = ['addPoint', 'searchKnn', 'writeIndex', 'readIndex', 'setEf'];
    for (const method of requiredMethods) {
      if (!this.index[method]) {
        throw new Error(`Required method ${method} not found in hnswlib-node`);
      }
    }
    
    // 檢查searchKnn返回格式
    if (this.docIdToLabel.size > 0) {
      try {
        const testVector = new Float32Array(this.config.dimensions).fill(0.5);
        const result = await this.index.searchKnn(Array.from(testVector), 1);
        
        this.searchKnnFormat = 'unknown';
        if (Array.isArray(result) && result.length === 2) {
          this.searchKnnFormat = 'array';
          console.log('[啟動自檢] searchKnn格式: [neighbors, distances]');
        } else if (result.neighbors && result.distances) {
          this.searchKnnFormat = 'object';
          console.log('[啟動自檢] searchKnn格式: {neighbors, distances}');
        }
      } catch (e) {
        console.warn('[啟動自檢] 無法檢測searchKnn格式:', e.message);
      }
    }
    
    // 驗證一致性
    await this.verifyConsistency();
  }
  
  /**
   * 驗證索引一致性（GPT-5建議）
   * @private
   */
  async verifyConsistency() {
    const metadataPath = `${this.config.indexPath}.meta.json`;
    
    if (existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(await fsPromises.readFile(metadataPath, 'utf-8'));
        
        // 檢查配置一致性
        if (metadata.dimensions !== this.config.dimensions) {
          console.warn(`[一致性檢查] 維度不匹配: ${metadata.dimensions} vs ${this.config.dimensions}`);
        }
        if (metadata.space !== this.config.space) {
          console.warn(`[一致性檢查] 空間不匹配: ${metadata.space} vs ${this.config.space}`);
        }
        
        // 檢查向量數量
        if (metadata.activeVectors !== this.docIdToLabel.size) {
          console.warn(`[一致性檢查] 向量數量不匹配: ${metadata.activeVectors} vs ${this.docIdToLabel.size}`);
        }
      } catch (e) {
        console.warn('[一致性檢查] 無法讀取元數據:', e.message);
      }
    }
  }
  
  /**
   * 計算索引校驗和（用於一致性檢查）
   * @private
   */
  calculateChecksum() {
    const data = JSON.stringify({
      count: this.docIdToLabel.size,
      nextLabel: this.nextLabel,
      docIds: Array.from(this.docIdToLabel.keys()).sort()
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * 創建新索引
   */
  async createNewIndex() {
    // 創建HNSW索引
    this.index = new this.HierarchicalNSW(this.config.space, this.config.dimensions);
    await this.index.initIndex(
      this.config.maxElements,
      this.config.m,
      this.config.efConstruction,
      this.config.seed
    );
    
    // 創建側車存儲（傳遞配置以確保維度一致）
    this.sidecar = new VectorSidecarStore(this.config.sidecarPath, {
      dimensions: this.config.dimensions,
      space: this.config.space,
      modelName: 'Xenova/all-MiniLM-L6-v2'  // TODO: 應該從config傳入
    });
    
    // 設置搜索參數
    this.index.setEf(this.config.efSearch);
    
    console.log('創建新的HNSW索引:', {
      dimensions: this.config.dimensions,
      space: this.config.space,
      maxElements: this.config.maxElements
    });
  }
  
  /**
   * 載入現有索引
   * @param {string} indexPath - 索引路徑（可選，用於Windows Generation模式）
   */
  async loadIndex(indexPath) {
    const loadPath = indexPath || this.config.indexPath;
    console.log('載入現有索引:', loadPath);
    
    // 載入HNSW索引 - 使用正確的API方法名
    this.index = new this.HierarchicalNSW(this.config.space, this.config.dimensions);
    // Windows 平台特殊處理：使用相對路徑策略
    if (process.platform === 'win32' && loadPath.includes('元奶奶')) {
        const relativePath = path.relative(process.cwd(), loadPath);
        console.log('載入現有索引 (相對路徑):', relativePath);
        try {
            await this.index.readIndex(relativePath);
        } catch (error) {
            console.log('相對路徑失敗，嘗試絕對路徑...');
            await this.index.readIndex(loadPath);
        }
    } else {
        await this.index.readIndex(loadPath);
    } // 正確：readIndex而不是readIndexFromFile
    
    // 載入側車存儲（傳遞配置以確保維度一致）
    this.sidecar = new VectorSidecarStore(this.config.sidecarPath, {
      dimensions: this.config.dimensions,
      space: this.config.space,
      modelName: 'Xenova/all-MiniLM-L6-v2'  // TODO: 應該從config傳入
    });
    
    // 恢復映射關係
    const mappings = this.sidecar.getAllMappings();
    for (const [docId, label] of mappings) {
      this.docIdToLabel.set(docId, label);
      this.labelToDocId.set(label, docId);
      this.nextLabel = Math.max(this.nextLabel, label + 1);
    }
    
    // 設置搜索參數
    this.index.setEf(this.config.efSearch);
    
    const stats = this.sidecar.getStats();
    console.log('索引載入完成:', {
      totalVectors: stats.totalVectors,
      sizeBytes: stats.sizeBytes,
      lastUpdate: stats.lastUpdate
    });
  }
  
  /**
   * 插入或更新向量
   * @param {string} docId - 文檔ID
   * @param {Float32Array} vector - 向量數據
   * @param {Object} metadata - 元數據
   */
  async upsertEmbedding(docId, vector, metadata = {}) {
    if (!this.initialized) await this.initialize();
    
    // 驗證向量維度
    if (!(vector instanceof Float32Array) || vector.length !== this.config.dimensions) {
      throw new Error(`向量維度錯誤: 期望${this.config.dimensions}維Float32Array，實際${vector?.length}`);
    }
    
    // 零向量檢查（GPT-5建議）
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) {
      throw new Error('Cannot index zero vector');
    }
    
    // 如果使用內積空間，檢查並執行正規化
    if (this.config.space === 'ip') {
      if (Math.abs(norm - 1.0) > 0.01) {
        console.warn('內積空間需要正規化向量，自動正規化中...');
        // 自動正規化
        for (let i = 0; i < vector.length; i++) {
          vector[i] /= norm;
        }
      }
    }
    
    // 容量檢查（GPT-5建議）
    if (this.index.getCurrentCount && this.index.getMaxElements) {
      const currentCount = this.index.getCurrentCount();
      const maxElements = this.index.getMaxElements();
      if (currentCount >= maxElements * 0.8) {
        console.log(`[容量管理] 擴展索引從 ${maxElements} 到 ${maxElements * 2}`);
        if (this.index.resizeIndex) {
          await this.index.resizeIndex(maxElements * 2);
        }
      }
    }
    
    // 處理更新情況
    let label;
    const existingLabel = this.docIdToLabel.get(docId);
    
    if (existingLabel !== undefined) {
      // 更新現有向量：先標記刪除舊label（如果支援）
      if (this.index.markDeleted) {
        try {
          this.index.markDeleted(existingLabel);
        } catch (e) {
          // 某些版本可能不支援markDeleted
          console.debug('markDeleted not supported, using new label strategy');
        }
      }
      
      // 創建新label（解決label重複問題）
      label = this.nextLabel++;
      
      // 更新映射
      this.labelToDocId.delete(existingLabel);
      this.docIdToLabel.set(docId, label);
      this.labelToDocId.set(label, docId);
      
      console.log(`更新向量: ${docId} (舊label=${existingLabel}, 新label=${label})`);
    } else {
      // 新文檔
      label = this.nextLabel++;
      this.docIdToLabel.set(docId, label);
      this.labelToDocId.set(label, docId);
      
      console.log(`新增向量: ${docId} (label=${label})`);
    }
    
    // 重要：轉換為Array（hnswlib-node需要）
    const arrayVector = Array.from(vector);
    
    // 添加到HNSW索引
    await this.index.addPoint(arrayVector, label);
    
    // 保存到側車存儲
    this.sidecar.saveVector(docId, label, vector, metadata);
    
    this.isDirty = true;
  }
  
  /**
   * 搜索相似向量
   * @param {Float32Array} queryVector - 查詢向量
   * @param {number} k - 返回的結果數
   * @param {Object} options - 搜索選項
   * @returns {Array} 搜索結果
   */
  async searchSimilar(queryVector, k = 10, options = {}) {
    if (!this.initialized) await this.initialize();
    
    if (this.docIdToLabel.size === 0) {
      return [];
    }
    
    // 驗證查詢向量
    if (!(queryVector instanceof Float32Array) || queryVector.length !== this.config.dimensions) {
      throw new Error(`查詢向量維度錯誤: 期望${this.config.dimensions}維，實際${queryVector?.length}`);
    }
    
    // 正規化查詢向量（如果需要）
    if (this.config.space === 'ip') {
      const norm = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
      if (Math.abs(norm - 1.0) > 0.01) {
        const normalizedQuery = new Float32Array(queryVector);
        for (let i = 0; i < normalizedQuery.length; i++) {
          normalizedQuery[i] /= norm;
        }
        queryVector = normalizedQuery;
      }
    }
    
    // 設置搜索參數
    if (options.efSearch && options.efSearch !== this.config.efSearch) {
      this.index.setEf(options.efSearch);
    }
    
    // 重要：轉換為Array
    const arrayQueryVector = Array.from(queryVector);
    
    // Clamp k to avoid errors（GPT-5建議）
    const currentCount = this.index.getCurrentCount ? this.index.getCurrentCount() : this.docIdToLabel.size;
    const effectiveK = Math.min(k * 2, currentCount);
    
    if (effectiveK === 0) {
      return [];
    }
    
    // 執行k-NN搜索
    const result = await this.index.searchKnn(arrayQueryVector, effectiveK);
    
    // 適配不同返回格式（GPT-5建議）
    let neighbors, distances;
    if (Array.isArray(result) && result.length === 2) {
      // 格式：[neighbors, distances]
      [neighbors, distances] = result;
    } else if (result.neighbors && result.distances) {
      // 格式：{ neighbors, distances }
      neighbors = result.neighbors;
      distances = result.distances;
    } else if (result.neighbors && !result.distances) {
      // 某些版本可能只返回neighbors，包含id和distance
      neighbors = result.neighbors.map(n => n.id || n);
      distances = result.neighbors.map(n => n.distance || 0);
    } else {
      console.error('Unknown searchKnn result format:', result);
      throw new Error('Unknown searchKnn result format');
    }
    
    // 處理結果
    const results = [];
    for (let i = 0; i < neighbors.length; i++) {
      const label = neighbors[i];
      const distance = distances[i];
      const docId = this.labelToDocId.get(label);
      
      // 跳過已刪除的向量
      if (!docId) continue;
      
      // 應用過濾器
      if (options.filter && !options.filter(docId)) continue;
      
      // 計算相似度分數（0-1範圍）
      let score;
      if (this.config.space === 'ip') {
        // 內積：對於正規化向量，範圍[0, 1]
        score = (2.0 - distance) / 2.0;
      } else if (this.config.space === 'cosine') {
        // 餘弦：距離範圍[0, 2]，轉換到相似度[0, 1]
        score = 1.0 - distance / 2.0;
      } else {
        // L2距離：使用倒數轉換
        score = 1.0 / (1.0 + distance);
      }
      
      // 半徑過濾
      if (options.radius && score < options.radius) continue;
      
      // 獲取元數據和向量（如果需要）
      let metadata = {};
      let vector = null;
      
      if (options.fetchMetadata || options.returnVectors) {
        const stored = this.sidecar.getVector(docId);
        if (stored) {
          metadata = stored.metadata;
          if (options.returnVectors) {
            vector = stored.vector;
          }
        }
      }
      
      results.push({
        docId,
        score,
        distance,
        metadata,
        vector
      });
      
      if (results.length >= k) break;
    }
    
    // 恢復默認搜索參數
    if (options.efSearch && options.efSearch !== this.config.efSearch) {
      this.index.setEf(this.config.efSearch);
    }
    
    return results;
  }
  
  /**
   * 獲取單個向量
   * @param {string} docId - 文檔ID
   * @returns {Float32Array|null} 向量數據
   */
  async getEmbedding(docId) {
    if (!this.initialized) await this.initialize();
    
    const stored = this.sidecar.getVector(docId);
    return stored?.vector || null;
  }
  
  /**
   * 批量獲取向量
   * @param {Array} docIds - 文檔ID數組
   * @returns {Array} 向量數組
   */
  async getEmbeddingBatch(docIds) {
    if (!this.initialized) await this.initialize();
    
    return docIds.map(docId => {
      const stored = this.sidecar.getVector(docId);
      return stored?.vector || null;
    });
  }
  
  /**
   * 檢查是否有向量
   * @param {string} docId - 文檔ID
   * @returns {boolean} 是否存在
   */
  async hasEmbedding(docId) {
    if (!this.initialized) await this.initialize();
    
    return this.docIdToLabel.has(docId);
  }
  
  /**
   * 刪除向量
   * @param {string} docId - 文檔ID
   */
  async deleteEmbedding(docId) {
    if (!this.initialized) await this.initialize();
    
    const label = this.docIdToLabel.get(docId);
    if (label === undefined) return;
    
    // 從映射中移除
    this.docIdToLabel.delete(docId);
    this.labelToDocId.delete(label);
    
    // 從側車存儲中移除
    this.sidecar.removeVector(docId);
    
    // 注意：hnswlib不支持真正的刪除，向量仍在索引中但不會被返回
    
    this.isDirty = true;
    console.log(`刪除向量: ${docId} (label=${label})`);
  }
  
  /**
   * 原子化保存索引（GPT-5建議的兩段式持久化）
   * Windows平台使用Generation模式，Linux/Mac使用原有邏輯
   * @param {string} path - 保存路徑（可選）
   */
  async saveIndex(savePath) {
    if (!this.initialized) return;
    
    const indexPath = savePath || this.config.indexPath;
    
    // Windows平台使用Generation模式（GPT-5解決方案）
    if (process.platform === 'win32' && this.windowsSafeManager) {
      console.log('[saveIndex] 使用Windows Generation模式保存索引...');
      
      // 使用修復的Generation模式保存（使用相對路徑策略）
      const savedPath = await this.windowsSafeManager.saveIndexWithWorkaround(async (writePath) => {
        // 寫入索引（使用相對路徑或切換目錄策略）
        await this.index.writeIndex(writePath);
      });
      
      // 保存側車存儲（SQLite事務）
      const saveTransaction = this.sidecar.db.transaction(() => {
        const stats = {
          totalVectors: this.nextLabel,
          activeVectors: this.docIdToLabel.size,
          indexVersion: Date.now(),
          checksum: this.calculateChecksum()
        };
        
        this.sidecar.db.prepare(`
          INSERT OR REPLACE INTO index_metadata (key, value) 
          VALUES ('stats', ?)
        `).run(JSON.stringify(stats));
      });
      
      saveTransaction();
      
      // 保存元數據文件
      const metadata = {
        dimensions: this.config.dimensions,
        space: this.config.space,
        normalized: this.config.space === 'ip',
        totalVectors: this.nextLabel,
        activeVectors: this.docIdToLabel.size,
        deletedVectors: this.nextLabel - this.docIdToLabel.size,
        savedAt: new Date().toISOString(),
        generationPath: savedPath
      };
      
      writeFileSync(
        `${indexPath}.meta.json`,
        JSON.stringify(metadata, null, 2)
      );
      
      this.isDirty = false;
      console.log('[saveIndex] Windows索引保存完成:', savedPath);
      
      return;
    }
    
    // Linux/Mac使用原有邏輯
    const tempPath = `${indexPath}.tmp`;
    
    // Step 1: 開啟SQLite事務
    const saveTransaction = this.sidecar.db.transaction(() => {
      // 寫入版本號和統計信息
      const stats = {
        totalVectors: this.nextLabel,
        activeVectors: this.docIdToLabel.size,
        indexVersion: Date.now(),
        checksum: this.calculateChecksum()
      };
      
      this.sidecar.db.prepare(`
        INSERT OR REPLACE INTO index_metadata (key, value) 
        VALUES ('stats', ?)
      `).run(JSON.stringify(stats));
      
      // 注意：WAL checkpoint移到事務外執行，避免鎖定
    });
    
    try {
      console.log('保存索引中...');
      
      // Step 2: 寫索引到臨時文件 - 使用正確的API方法名
      await this.index.writeIndex(tempPath); // 正確：writeIndex而不是writeIndexToFile
      
      // Step 3: fsync確保寫入磁盤（GPT-5建議）- Windows相容性處理
      // 在Windows上fsync可能導致EPERM錯誤，使用try-catch處理
      try {
        const fd = openSync(tempPath, 'r');
        fsyncSync(fd);
        closeSync(fd);
      } catch (fsyncError) {
        // Windows平台可能不支援fsync，但文件已經寫入
        if (fsyncError.code !== 'EPERM') {
          // 如果不是權限問題，則重新拋出錯誤
          throw fsyncError;
        }
        console.debug('[saveIndex] fsync skipped on Windows (EPERM)');
      }
      
      // Step 4: 執行SQLite事務
      saveTransaction();
      
      // Step 5: WAL checkpoint（在事務外執行，避免鎖定）
      try {
        this.sidecar.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (checkpointError) {
        // checkpoint失敗不影響數據完整性，只是性能優化
        console.debug('[saveIndex] WAL checkpoint failed (non-critical):', checkpointError.message);
      }
      
      // Step 6: 原子重命名（Windows相容性處理）
      // 在Windows上，需要先刪除目標文件才能重命名
      if (existsSync(indexPath)) {
        try {
          renameSync(indexPath, `${indexPath}.backup`);
        } catch (renameError) {
          if (renameError.code === 'EPERM' || renameError.code === 'EACCES') {
            // Windows權限問題：先刪除舊的備份，再嘗試
            if (existsSync(`${indexPath}.backup`)) {
              unlinkSync(`${indexPath}.backup`);
            }
            // 直接刪除原文件
            unlinkSync(indexPath);
            console.debug('[saveIndex] Windows workaround: deleted old index file');
          } else {
            throw renameError;
          }
        }
      }
      
      // 重命名臨時文件為正式文件
      try {
        renameSync(tempPath, indexPath);
      } catch (finalRenameError) {
        if (finalRenameError.code === 'EPERM' || finalRenameError.code === 'EACCES') {
          // Windows最後手段：使用複製+刪除
          const fs = await import('fs');
          fs.copyFileSync(tempPath, indexPath);
          unlinkSync(tempPath);
          console.debug('[saveIndex] Windows workaround: used copy instead of rename');
        } else {
          throw finalRenameError;
        }
      }
      
      // Step 7: 刪除備份
      if (existsSync(`${indexPath}.backup`)) {
        unlinkSync(`${indexPath}.backup`);
      }
      
      // Step 8: 保存元數據文件
      const metadata = {
        dimensions: this.config.dimensions,
        space: this.config.space,
        normalized: this.config.space === 'ip',
        totalVectors: this.nextLabel,
        activeVectors: this.docIdToLabel.size,
        deletedVectors: this.nextLabel - this.docIdToLabel.size,
        savedAt: new Date().toISOString()
      };
      
      writeFileSync(
        `${indexPath}.meta.json`,
        JSON.stringify(metadata, null, 2)
      );
      
      this.isDirty = false;
      console.log('索引保存完成:', metadata);
      
    } catch (error) {
      console.error('保存索引失敗:', error);
      // 嘗試恢復
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      if (existsSync(`${indexPath}.backup`)) {
        renameSync(`${indexPath}.backup`, indexPath);
      }
      throw error;
    }
  }
  
  /**
   * 重建索引（清理已刪除的向量）
   * @param {Object} options - 重建選項
   */
  async rebuildIndex(options = {}) {
    if (!this.initialized) await this.initialize();
    
    const onProgress = options.onProgress || (() => {});
    
    console.log('開始重建索引...');
    const startTime = Date.now();
    
    // 創建新索引
    const newIndex = new this.HierarchicalNSW(this.config.space, this.config.dimensions);
    await newIndex.initIndex(
      this.config.maxElements,
      this.config.m,
      this.config.efConstruction,
      this.config.seed
    );
    newIndex.setEf(this.config.efSearch);
    
    // 重新映射label
    const newDocIdToLabel = new Map();
    const newLabelToDocId = new Map();
    let newLabel = 0;
    
    // 從側車存儲讀取所有活躍向量
    const allMappings = this.sidecar.getAllMappings();
    let processed = 0;
    const total = allMappings.size;
    
    for (const [docId, oldLabel] of allMappings) {
      const stored = this.sidecar.getVector(docId);
      if (!stored) continue;
      
      // 轉換為Array並添加到新索引
      const arrayVector = Array.from(stored.vector);
      await newIndex.addPoint(arrayVector, newLabel);
      
      // 更新映射
      newDocIdToLabel.set(docId, newLabel);
      newLabelToDocId.set(newLabel, docId);
      
      // 更新側車存儲中的label
      this.sidecar.saveVector(docId, newLabel, stored.vector, stored.metadata);
      
      newLabel++;
      processed++;
      
      // 報告進度
      if (processed % 100 === 0 || processed === total) {
        onProgress(processed, total);
      }
    }
    
    // 原子化切換
    this.index = newIndex;
    this.docIdToLabel = newDocIdToLabel;
    this.labelToDocId = newLabelToDocId;
    this.nextLabel = newLabel;
    
    // 保存新索引
    await this.saveIndex();
    
    const duration = Date.now() - startTime;
    console.log(`索引重建完成: ${processed}個向量, 耗時${duration}ms`);
    
    onProgress(processed, total);
  }
  
  /**
   * 獲取統計信息
   * @returns {Object} 統計數據
   */
  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const sidecarStats = this.sidecar.getStats();
    
    return {
      totalVectors: this.nextLabel,
      activeVectors: this.docIdToLabel.size,
      deletedVectors: this.nextLabel - this.docIdToLabel.size,
      dimensions: this.config.dimensions,
      space: this.config.space,
      m: this.config.m,
      efConstruction: this.config.efConstruction,
      efSearch: this.config.efSearch,
      indexPath: this.config.indexPath,
      ...sidecarStats,
      isDirty: this.isDirty,
      deletionRatio: this.nextLabel > 0 
        ? (this.nextLabel - this.docIdToLabel.size) / this.nextLabel
        : 0
    };
  }
  
  /**
   * 啟動自動保存
   */
  startAutoSave() {
    if (this.autoSaveTimer) return;
    
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveIndex().catch(error => {
          console.error('自動保存失敗:', error);
        });
      }
    }, this.config.autoSaveInterval);
    
    console.log(`啟動自動保存，間隔: ${this.config.autoSaveInterval}ms`);
  }
  
  /**
   * 停止自動保存
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('停止自動保存');
    }
  }
  
  /**
   * 清空索引
   */
  async clear() {
    if (!this.initialized) await this.initialize();
    
    // 重新初始化索引
    this.index = new this.HierarchicalNSW(this.config.space, this.config.dimensions);
    await this.index.initIndex(
      this.config.maxElements,
      this.config.m,
      this.config.efConstruction,
      this.config.seed
    );
    this.index.setEf(this.config.efSearch);
    
    // 清空映射
    this.docIdToLabel.clear();
    this.labelToDocId.clear();
    this.nextLabel = 0;
    
    // 清空側車存儲
    this.sidecar.clear();
    
    this.isDirty = true;
    console.log('索引已清空');
  }
  
  /**
   * 釋放資源
   */
  async dispose() {
    console.log('釋放HNSWLibAdapter資源...');
    
    // 停止自動保存
    this.stopAutoSave();
    
    // 保存索引（如果有變更）
    if (this.isDirty) {
      await this.saveIndex();
    }
    
    // 關閉側車存儲
    if (this.sidecar) {
      this.sidecar.close();
      this.sidecar = null;
    }
    
    // 清理索引
    this.index = null;
    this.initialized = false;
    
    console.log('HNSWLibAdapter資源已釋放');
  }
  
  /**
   * 檢查索引健康狀況
   */
  async healthCheck() {
    if (!this.initialized) {
      return {
        healthy: false,
        reason: '索引未初始化'
      };
    }
    
    const stats = await this.getStats();
    const issues = [];
    
    // 檢查刪除率
    if (stats.deletionRatio > 0.5) {
      issues.push(`刪除率過高: ${(stats.deletionRatio * 100).toFixed(1)}%，建議重建索引`);
    }
    
    // 檢查向量數量
    if (stats.activeVectors === 0) {
      issues.push('索引為空');
    }
    
    // 檢查索引檔案
    // 檢查索引檔案（考慮 Generation 模式）
    let indexFileExists = false;
    if (process.platform === 'win32' && this.windowsSafeManager) {
      // Windows Generation 模式：檢查 CURRENT 指向的文件
      const currentPath = await this.windowsSafeManager.resolveCurrentIndexPath();
      indexFileExists = currentPath && existsSync(currentPath);
    } else {
      // 標準模式：檢查配置的路徑
      indexFileExists = existsSync(this.config.indexPath);
    }
    
    if (!indexFileExists) {
      issues.push('索引檔案不存在');
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      stats,
      recommendation: issues.length > 0 
        ? '建議執行 rebuildIndex() 優化索引'
        : '索引狀態良好'
    };
  }
  
  /**
   * 設置搜索時的ef參數
   * @param {number} efSearch - 搜索ef值
   */
  setEfSearch(efSearch) {
    this.efSearch = efSearch;
    if (this.index) {
      this.index.setEf(efSearch);
    }
    console.log(`[HNSWLibAdapter] efSearch set to: ${efSearch}`);
  }
  
  /**
   * 獲取索引檔案大小
   * @returns {Promise<number>} 檔案大小(bytes)
   */
  async getIndexSize() {
    try {
      const stats = await fsPromises.stat(this.config.indexPath);
      return stats.size;
    } catch (error) {
      console.warn(`[HNSWLibAdapter] Cannot get index size: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * 獲取側車存儲檔案大小
   * @returns {Promise<number>} 檔案大小(bytes)
   */
  async getSidecarSize() {
    try {
      const stats = await fsPromises.stat(this.config.sidecarPath);
      return stats.size;
    } catch (error) {
      console.warn(`[HNSWLibAdapter] Cannot get sidecar size: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * 定期維護任務（GPT-5建議）
   */
  async maintenanceTask() {
    const stats = await this.getStats();
    const deletionRatio = stats.deletedVectors / stats.totalVectors;
    
    // 刪除比例超過30%時重建
    if (deletionRatio > 0.3) {
      console.log('[維護任務] 開始重建索引，刪除率:', (deletionRatio * 100).toFixed(1) + '%');
      await this.rebuildIndex({
        onProgress: (processed, total) => {
          console.log(`[維護任務] 重建進度: ${processed}/${total}`);
        }
      });
    }
  }
}

// 導出類
export { HNSWLibAdapter };
