// path-resolver.js
// 統一的路徑解析器 - 實現第14項模組契約
// 2025-09-18

import path from 'path';
import { promises as fs } from 'fs';

/**
 * 路徑解析器 - 確保所有模組使用統一的目錄結構
 * 實現第14項模組契約：目錄結構與文件路徑契約
 */
export class PathResolver {
  constructor(config = {}) {
    // 專案根目錄（必須是絕對路徑）
    this.projectRoot = path.resolve(config.projectRoot || process.cwd());
    
    // 數據目錄（統一結構）
    this.dataDir = path.join(this.projectRoot, config.dataDir || 'data');
    this.indexDir = path.join(this.dataDir, 'indexes');
    this.embeddingDir = path.join(this.dataDir, 'embeddings');
    this.documentDir = path.join(this.dataDir, 'documents');
    this.metadataDir = path.join(this.dataDir, 'metadata');
    
    // 其他目錄
    this.modelDir = path.join(this.projectRoot, 'models');
    this.logDir = path.join(this.projectRoot, 'logs');
    this.tempDir = path.join(this.projectRoot, 'temp');
    
    // 測試模式支援
    if (config.testMode) {
      this.dataDir = config.testDir || './test-data';
      this.indexDir = path.join(this.dataDir, 'indexes');
    }
  }
  
  /**
   * 解析索引文件路徑
   * @param {string} filename - 文件名或路徑
   * @returns {string} 絕對路徑
   */
  resolveIndexPath(filename) {
    // 如果已經是絕對路徑，直接返回
    if (path.isAbsolute(filename)) {
      return filename;
    }
    
    // 如果包含路徑分隔符，基於專案根目錄解析
    if (filename.includes(path.sep) || filename.includes('/')) {
      return path.resolve(this.projectRoot, filename);
    }
    
    // 單純文件名，放在 indexes 目錄
    return path.join(this.indexDir, filename);
  }
  
  /**
   * 解析側車存儲路徑
   * @param {string} filename - 文件名或路徑
   * @returns {string} 絕對路徑
   */
  resolveSidecarPath(filename) {
    if (path.isAbsolute(filename)) {
      return filename;
    }
    
    // 側車文件與索引文件在同一目錄
    if (filename.includes(path.sep) || filename.includes('/')) {
      return path.resolve(this.projectRoot, filename);
    }
    
    return path.join(this.indexDir, filename);
  }
  
  /**
   * 解析Generation目錄路徑（Windows專用）
   * @param {string} indexPath - 索引文件路徑
   * @returns {string} Generation目錄絕對路徑
   */
  resolveGenerationDir(indexPath) {
    const dir = path.dirname(indexPath);
    const baseName = path.basename(indexPath, path.extname(indexPath));
    return path.join(dir, `.${baseName}-generations`);
  }
  
  /**
   * 解析臨時文件路徑
   * @param {string} filename - 文件名
   * @returns {string} 絕對路徑
   */
  resolveTempPath(filename) {
    return path.join(this.tempDir, filename);
  }
  
  /**
   * 確保目錄存在
   * @param {string} dirPath - 目錄路徑
   */
  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      return false;
    }
  }
  
  /**
   * 確保所有基礎目錄存在
   */
  async ensureAllDirs() {
    const dirs = [
      this.dataDir,
      this.indexDir,
      this.embeddingDir,
      this.documentDir,
      this.metadataDir,
      this.modelDir,
      this.logDir,
      this.tempDir
    ];
    
    for (const dir of dirs) {
      await this.ensureDir(dir);
    }
  }
  
  /**
   * 驗證路徑是否在允許的範圍內
   * @param {string} filepath - 要驗證的路徑
   * @returns {boolean} 是否有效
   */
  isValidPath(filepath) {
    const resolved = path.resolve(filepath);
    const allowedDirs = [
      this.dataDir,
      this.modelDir,
      this.logDir,
      this.tempDir
    ];
    
    return allowedDirs.some(dir => resolved.startsWith(dir));
  }
  
  /**
   * 獲取相對路徑（用於日誌顯示）
   * @param {string} absolutePath - 絕對路徑
   * @returns {string} 相對路徑
   */
  getRelativePath(absolutePath) {
    return path.relative(this.projectRoot, absolutePath);
  }
  
  /**
   * 清理臨時文件
   * @param {number} maxAge - 最大保留時間（毫秒）
   */
  async cleanupTempFiles(maxAge = 3600000) { // 默認1小時
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          console.log(`[PathResolver] 清理臨時文件: ${file}`);
        }
      }
    } catch (error) {
      console.error('[PathResolver] 清理臨時文件失敗:', error.message);
    }
  }
  
  /**
   * 獲取目錄統計信息
   */
  async getStats() {
    const stats = {};
    const dirs = {
      indexes: this.indexDir,
      embeddings: this.embeddingDir,
      documents: this.documentDir,
      metadata: this.metadataDir,
      temp: this.tempDir
    };
    
    for (const [name, dir] of Object.entries(dirs)) {
      try {
        const files = await fs.readdir(dir);
        let totalSize = 0;
        
        for (const file of files) {
          const filepath = path.join(dir, file);
          const fileStat = await fs.stat(filepath);
          if (fileStat.isFile()) {
            totalSize += fileStat.size;
          }
        }
        
        stats[name] = {
          fileCount: files.length,
          totalSize: totalSize,
          path: this.getRelativePath(dir)
        };
      } catch (error) {
        stats[name] = {
          fileCount: 0,
          totalSize: 0,
          path: this.getRelativePath(dir),
          error: error.message
        };
      }
    }
    
    return stats;
  }
}

// 導出單例（確保全局統一）
export const globalPathResolver = new PathResolver();

export default PathResolver;
