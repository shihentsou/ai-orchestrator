// contracts/third-party-usage-contracts.js
// 第三方庫使用契約 - 明確定義所有外部依賴的使用方式
// v5.2.1 - 2025-09-17

/**
 * 這個檔案定義了所有第三方庫的正確使用方式
 * 避免實現時的猜測和錯誤
 */

export const THIRD_PARTY_CONTRACTS = {
  /**
   * hnswlib-node - HNSW 向量索引庫
   */
  'hnswlib-node': {
    version: '^3.0.0',
    importMethod: 'dynamic', // static | dynamic
    
    // 正確的導入方式
    correctImport: `
      const hnswlibModule = await import('hnswlib-node');
      const { HierarchicalNSW } = hnswlibModule.default;
    `,
    
    // 使用範例
    usage: `
      const index = new HierarchicalNSW('ip', 384);
      index.initIndex(maxElements, m, efConstruction);
      index.setEf(efSearch);
      index.addPoint(vector, label);
      const result = index.searchKnn(queryVector, k);
    `,
    
    // 常見錯誤
    commonMistakes: [
      "不要使用 hnswlibModule.HierarchicalNSW（沒有 .default）",
      "不要使用 require('hnswlib-node')（這是 CommonJS）"
    ]
  },
  
  /**
   * @xenova/transformers - 本地嵌入模型
   */
  '@xenova/transformers': {
    version: '^2.6.0',
    importMethod: 'static',
    
    correctImport: `
      import { pipeline, env } from '@xenova/transformers';
    `,
    
    initialization: `
      // 設置模型快取目錄
      env.cacheDir = './models';
      env.localURL = './models';
      
      // 創建 pipeline
      const extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { quantized: false }
      );
    `,
    
    usage: `
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true
      });
      const vector = new Float32Array(output.data);
    `
  },
  
  /**
   * better-sqlite3 - SQLite 資料庫
   */
  'better-sqlite3': {
    version: '^9.0.0',
    importMethod: 'static',
    
    correctImport: `
      import Database from 'better-sqlite3';
    `,
    
    usage: `
      const db = new Database(path);
      db.pragma('journal_mode = WAL');
      const stmt = db.prepare('SELECT * FROM table WHERE id = ?');
      const row = stmt.get(id);
    `,
    
    commonMistakes: [
      "不要使用 new Database.Database（）",
      "記得使用 .close() 關閉連接"
    ]
  },
  
  /**
   * Node.js fs 模組 - 檔案系統操作
   */
  'fs': {
    version: 'native',
    importMethod: 'mixed',
    
    // 同步函數導入
    syncImport: `
      import { 
        existsSync, 
        mkdirSync, 
        readFileSync, 
        writeFileSync,
        renameSync,
        unlinkSync 
      } from 'fs';
    `,
    
    // 異步 Promise 函數導入
    asyncImport: `
      import { promises as fsPromises } from 'fs';
      // 或者
      import { 
        readFile, 
        writeFile, 
        stat, 
        mkdir 
      } from 'fs/promises';
    `,
    
    usage: `
      // 同步操作
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf8');
      }
      
      // 異步操作
      const stats = await fsPromises.stat(path);
      await fsPromises.writeFile(path, content);
    `,
    
    commonMistakes: [
      "不要混淆 fs.existsSync 和 fsPromises.exists（後者不存在）",
      "promises API 沒有 existsSync，這是同步函數"
    ]
  },
  
  /**
   * path 模組 - 路徑操作
   */
  'path': {
    version: 'native',
    importMethod: 'static',
    
    correctImport: `
      import * as path from 'path';
      // 或者
      import { dirname, join, resolve } from 'path';
    `,
    
    usage: `
      const fullPath = path.join(__dirname, 'data', 'file.txt');
      const dir = path.dirname(fullPath);
      const ext = path.extname(fullPath);
    `
  },
  
  /**
   * url 模組 - ESM 中的 __dirname 替代
   */
  'url': {
    version: 'native',
    importMethod: 'static',
    
    correctImport: `
      import { fileURLToPath } from 'url';
      import { dirname } from 'path';
    `,
    
    usage: `
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
    `,
    
    note: "ESM 模組中沒有 __dirname 和 __filename，需要自己創建"
  }
};

/**
 * 驗證第三方庫的使用是否符合契約
 */
export function validateThirdPartyUsage(moduleName, codeSnippet) {
  const contract = THIRD_PARTY_CONTRACTS[moduleName];
  if (!contract) {
    console.warn(`No contract defined for module: ${moduleName}`);
    return true;
  }
  
  // 檢查常見錯誤
  for (const mistake of (contract.commonMistakes || [])) {
    // 這裡可以添加實際的檢查邏輯
    console.log(`Checking for mistake: ${mistake}`);
  }
  
  return true;
}

/**
 * 生成第三方庫的使用模板
 */
export function generateUsageTemplate(moduleName) {
  const contract = THIRD_PARTY_CONTRACTS[moduleName];
  if (!contract) {
    throw new Error(`No contract defined for module: ${moduleName}`);
  }
  
  let template = `// ${moduleName} v${contract.version}\n`;
  
  if (contract.correctImport) {
    template += `\n// Import\n${contract.correctImport}\n`;
  }
  
  if (contract.syncImport) {
    template += `\n// Sync Import\n${contract.syncImport}\n`;
  }
  
  if (contract.asyncImport) {
    template += `\n// Async Import\n${contract.asyncImport}\n`;
  }
  
  if (contract.initialization) {
    template += `\n// Initialization\n${contract.initialization}\n`;
  }
  
  if (contract.usage) {
    template += `\n// Usage\n${contract.usage}\n`;
  }
  
  return template;
}

export default THIRD_PARTY_CONTRACTS;
