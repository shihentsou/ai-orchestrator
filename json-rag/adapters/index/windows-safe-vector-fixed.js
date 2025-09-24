// fix-writeindex-path.js
// 修復 writeIndex 路徑問題 - 使用工作目錄內的相對路徑
// 2025-09-18

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 修復的 WindowsSafeVectorManager
 * 使用相對路徑解決 writeIndex 問題
 */
export class WindowsSafeVectorManagerFixed {
  constructor(opts) {
    const {
      baseDir,
      stem = 'index',
      keep = 3,
      ext = '.hnsw',
      backoff = [10, 20, 50, 100, 200],
      enableLock = true
    } = opts || {};

    // 重要：使用相對路徑而非絕對路徑
    // 將 baseDir 轉換為相對於當前工作目錄的路徑
    const absoluteBase = path.resolve(baseDir || `.${stem}-generations`);
    this.baseDir = path.relative(process.cwd(), absoluteBase) || '.';
    
    // 如果相對路徑為空（同一目錄），使用 '.'
    if (this.baseDir === '') {
      this.baseDir = '.';
    }
    
    // 確保使用正斜槓（跨平台兼容）
    this.baseDir = this.baseDir.replace(/\\/g, '/');
    
    this.stem = stem;
    this.keep = keep;
    this.ext = ext.startsWith('.') ? ext : `.${ext}`;
    this.backoff = backoff;
    this.enableLock = enableLock;
    
    // 使用相對路徑
    this.currentFile = path.join(this.baseDir, 'CURRENT').replace(/\\/g, '/');
    this.lockFile = path.join(this.baseDir, `${stem}.lock`).replace(/\\/g, '/');
    
    console.log(`[WindowsSafeVectorManagerFixed] 初始化:`);
    console.log(`  baseDir (相對): ${this.baseDir}`);
    console.log(`  baseDir (絕對): ${path.resolve(this.baseDir)}`);
    console.log(`  工作目錄: ${process.cwd()}`);
  }
  
  async init() {
    // 創建目錄（使用絕對路徑）
    await fs.mkdir(path.resolve(this.baseDir), { recursive: true });
  }
  
  /**
   * 生成唯一的文件名（不含路徑）
   */
  newGenerationName() {
    const timestamp = Date.now();
    const pid = process.pid;
    const random = Math.random().toString(36).slice(2, 8);
    return `${this.stem}-${timestamp}-${pid}-${random}${this.ext}`;
  }
  
  /**
   * 保存索引的核心方法
   * @param {Function} writeIndexFn - 調用 index.writeIndex 的函數
   */
  async saveIndexWithWorkaround(writeIndexFn) {
    await this.init();
    
    // 生成文件名（不含路徑）
    const genName = this.newGenerationName();
    
    // 嘗試不同的策略
    const strategies = [
      // 策略1：使用簡單的相對路徑
      {
        name: '相對路徑策略',
        getPath: () => path.join(this.baseDir, genName).replace(/\\/g, '/'),
        cleanup: null
      },
      // 策略2：先切換工作目錄（最可靠）
      {
        name: '切換目錄策略',
        getPath: () => genName,  // 只用文件名
        setup: async () => {
          this.originalCwd = process.cwd();
          process.chdir(path.resolve(this.baseDir));
          console.log(`  切換到目錄: ${process.cwd()}`);
        },
        cleanup: () => {
          if (this.originalCwd) {
            process.chdir(this.originalCwd);
            console.log(`  恢復目錄: ${process.cwd()}`);
          }
        }
      },
      // 策略3：使用當前目錄然後移動
      {
        name: '當前目錄策略',
        getPath: () => genName,
        cleanup: async (tmpPath) => {
          // 檢查文件是否在當前目錄
          try {
            const stats = await fs.stat(genName);
            if (stats.size > 0) {
              // 移動到目標目錄
              const targetPath = path.join(this.baseDir, genName);
              await fs.rename(genName, targetPath);
              console.log(`  移動文件: ${genName} -> ${targetPath}`);
              return targetPath;
            }
          } catch (e) {
            // 文件不在當前目錄
          }
        }
      }
    ];
    
    let savedPath = null;
    
    for (const strategy of strategies) {
      console.log(`\n嘗試 ${strategy.name}...`);
      
      try {
        // 執行設置
        if (strategy.setup) {
          await strategy.setup();
        }
        
        // 獲取路徑
        const writePath = strategy.getPath();
        console.log(`  寫入路徑: ${writePath}`);
        
        // 調用 writeIndex
        await writeIndexFn(writePath);
        
        // 驗證文件是否存在
        let finalPath = writePath;
        
        // 執行清理/移動
        if (strategy.cleanup) {
          const result = await strategy.cleanup(writePath);
          if (result) {
            finalPath = result;
          }
        }
        
        // 檢查文件
        const checkPath = path.resolve(finalPath);
        const stats = await fs.stat(checkPath);
        
        if (stats.size > 0) {
          console.log(`  ✅ 成功！文件大小: ${stats.size} bytes`);
          savedPath = checkPath;
          break;
        }
      } catch (error) {
        console.log(`  ❌ 失敗: ${error.message}`);
        
        // 恢復工作目錄
        if (this.originalCwd && process.cwd() !== this.originalCwd) {
          process.chdir(this.originalCwd);
        }
      }
    }
    
    if (!savedPath) {
      throw new Error('所有策略都失敗了，無法保存索引');
    }
    
    // 更新 CURRENT 文件
    await this.updateCurrent(path.basename(savedPath));
    
    return savedPath;
  }
  
  /**
   * 更新 CURRENT 指標文件
   */
  async updateCurrent(filename) {
    const currentPath = path.resolve(this.currentFile);
    await fs.writeFile(currentPath, filename + '\n', 'utf8');
    console.log(`[CURRENT] 更新指向: ${filename}`);
  }
  
  /**
   * 讀取當前索引路徑（兼容原API）
   */
  async getCurrentIndexPath() {
    try {
      const currentPath = path.resolve(this.currentFile);
      const content = await fs.readFile(currentPath, 'utf8');
      const filename = content.trim();
      if (filename) {
        return path.resolve(this.baseDir, filename);
      }
    } catch (e) {
      // CURRENT 文件不存在
    }
    return null;
  }
  
  /**
   * 兼容原有API名稱
   */
  async resolveCurrentIndexPath() {
    try {
      const currentPath = path.resolve(this.currentFile);
      const content = await fs.readFile(currentPath, 'utf8');
      const filename = content.trim();
      if (filename) {
        // 返回絕對路徑（供 loadIndex 處理）
        const absolutePath = path.resolve(this.baseDir, filename);
        return absolutePath;
      }
    } catch (e) {
      // CURRENT 文件不存在
    }
    return null;
  }
}

// 測試修復
async function testFix() {
  console.log('========================================');
  console.log('測試 WindowsSafeVectorManagerFixed');
  console.log('========================================\n');
  
  // 動態導入
  const hnswlibModule = await import('hnswlib-node');
  const HierarchicalNSW = hnswlibModule.default.HierarchicalNSW;
  
  // 創建測試索引
  const index = new HierarchicalNSW('l2', 10);
  await index.initIndex(100, 16, 200, 100);
  
  // 添加測試向量
  const vector = Array.from({ length: 10 }, () => Math.random());
  index.addPoint(vector, 0);
  
  // 測試修復的管理器
  const manager = new WindowsSafeVectorManagerFixed({
    baseDir: './test-fixed-generation',
    stem: 'test'
  });
  
  try {
    const savedPath = await manager.saveIndexWithWorkaround(async (path) => {
      await index.writeIndex(path);
    });
    
    console.log('\n✅ 測試成功！');
    console.log(`索引保存到: ${savedPath}`);
    
    // 驗證
    const currentPath = await manager.getCurrentIndexPath();
    console.log(`CURRENT 指向: ${currentPath}`);
    
    // 清理
    await fs.rm('./test-fixed-generation', { recursive: true, force: true });
    
  } catch (error) {
    console.error('\n❌ 測試失敗:', error.message);
  }
}

// 如果直接運行此文件，執行測試
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testFix().catch(console.error);
}

export default WindowsSafeVectorManagerFixed;
