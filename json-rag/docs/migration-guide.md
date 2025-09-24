# 從複雜RAG系統遷移到JSON-RAG v5.2

## 背景

MCP Server的功能22目前使用了一個過度複雜的RAG系統，存在以下問題：

1. **三層查詢系統混亂**：動態索引、知識庫、專案狀態檔案
2. **源代碼與狀態檔案混淆**：查詢返回錯誤的檔案路徑
3. **性能問題**：每次查詢消耗5000-8000 tokens
4. **維護困難**：代碼複雜度高，難以調試

JSON-RAG v5.2提供了一個簡潔、高效的替代方案。

## 遷移收益

| 指標 | 現有系統 | JSON-RAG v5.2 | 改進 |
|------|---------|---------------|------|
| 查詢成功率 | 85.7% | 99%+ | +13.3% |
| 查詢延遲 | 50-200ms | <10ms | 5-20倍 |
| Token使用 | 5000-8000 | <500 | 10-16倍 |
| 代碼行數 | 2000+ | <500 | 4倍 |
| 維護成本 | 高 | 低 | 顯著降低 |

## 遷移步驟

### Step 1: 評估現有系統

```javascript
// 1. 分析現有RAG使用情況
node analyze-current-rag.js

// 2. 導出現有數據
node export-rag-data.js > rag-data-backup.json

// 3. 記錄查詢模式
node log-query-patterns.js
```

### Step 2: 安裝JSON-RAG v5.2

```bash
# 1. 複製核心模塊
cp -r JSON-RAG-v5.2-Core/* ./mcp-server/lib/json-rag/

# 2. 安裝依賴（如果有）
cd mcp-server
npm install
```

### Step 3: 創建適配層

```javascript
// adapters/project-rag-adapter.js
import { createJSONRAG } from '../lib/json-rag/core/json-rag-core.js';

export class ProjectRAGAdapter {
  constructor(config) {
    this.jsonRAG = createJSONRAG({
      storage: config.storage || 'sqlite',
      index: {
        structural: 'sqlite-index',
        fulltext: 'fts5'
      },
      cache: 'memory'
    });
    
    // 保持與舊API兼容
    this.legacyMode = config.legacyMode || false;
  }

  // 兼容舊的查詢介面
  async loadProjectState(projectId, options = {}) {
    if (this.legacyMode) {
      // 模擬舊行為
      return this.legacyLoadProjectState(projectId, options);
    }
    
    // 使用新的查詢引擎
    const results = await this.jsonRAG.search({
      structural: {
        collection: 'projects',
        metadata: { projectId }
      }
    });
    
    return this.formatLegacyResponse(results);
  }
}
```

### Step 4: 數據遷移

```javascript
// migrate-rag-data.js
import { createJSONRAG } from './lib/json-rag/core/json-rag-core.js';
import fs from 'fs/promises';
import path from 'path';

async function migrateData() {
  const jsonRAG = createJSONRAG({
    storage: 'sqlite',
    index: {
      structural: 'sqlite-index',
      fulltext: 'fts5'
    }
  });
  
  await jsonRAG.initialize();
  
  // 1. 遷移專案狀態
  const projectStates = await loadProjectStates();
  for (const state of projectStates) {
    await jsonRAG.put('projects', state.id, state.data, {
      indexFields: ['name', 'status', 'phase'],
      fulltext: true
    });
  }
  
  // 2. 遷移功能映射
  const featureMapping = await loadFeatureMapping();
  for (const [keyword, info] of Object.entries(featureMapping)) {
    await jsonRAG.put('features', keyword, info);
  }
  
  // 3. 創建索引
  await jsonRAG.createSnapshot();
  
  console.log('數據遷移完成！');
}
```

### Step 5: 更新server.js

```javascript
// 替換原有的RAG導入
// 舊代碼：
// import { ProjectStatusManagerRAG } from './project-status-manager-rag.js';

// 新代碼：
import { ProjectRAGAdapter } from './adapters/project-rag-adapter.js';

// 在setupToolHandlers中更新
case 'find_project_status': {
  // 使用新的適配器
  const ragAdapter = new ProjectRAGAdapter({
    storage: 'sqlite',
    legacyMode: false  // 完全切換到新系統
  });
  
  await ragAdapter.initialize();
  
  const result = await ragAdapter.query(
    params.keyword,
    params.action
  );
  
  return result;
}
```

### Step 6: 測試驗證

```javascript
// test-migration.js
import { runLegacyTests } from './tests/legacy-rag-tests.js';
import { runNewTests } from './tests/json-rag-tests.js';

async function validateMigration() {
  console.log('運行兼容性測試...');
  const legacyResults = await runLegacyTests();
  
  console.log('運行新系統測試...');
  const newResults = await runNewTests();
  
  // 比較結果
  console.log('測試結果對比:');
  console.log('舊系統成功率:', legacyResults.successRate);
  console.log('新系統成功率:', newResults.successRate);
  console.log('性能提升:', newResults.avgLatency / legacyResults.avgLatency);
}
```

## 關鍵差異對照

### 查詢方式

**舊系統**：
```javascript
const results = await projectManager.loadProjectState('mcp_server_dev', {
  query: '功能21',
  intentType: 'feature_info',
  smartLoad: true
});
```

**新系統**：
```javascript
const results = await jsonRAG.search({
  structural: {
    collection: 'features',
    metadata: { keyword: '功能21' }
  }
});
```

### 數據更新

**舊系統**：
```javascript
await projectManager.updateProjectState('mcp_server_dev', {
  path: 'activeTasks.current_work',
  value: newTaskData,
  operation: 'merge'
});
```

**新系統**：
```javascript
await jsonRAG.put('projects', 'mcp_server_dev:activeTasks', {
  current_work: newTaskData,
  updated_at: new Date().toISOString()
});
```

## 常見問題處理

### Q1: 如何處理舊的查詢邏輯？

創建一個兼容層：
```javascript
class LegacyCompatLayer {
  translateQuery(oldQuery) {
    // 將舊查詢格式轉換為新格式
    return {
      structural: this.extractStructural(oldQuery),
      semantic: this.extractSemantic(oldQuery)
    };
  }
}
```

### Q2: 緩存如何遷移？

JSON-RAG v5.2內建了更智能的緩存：
- 對話級緩存自動管理
- LRU淘汰策略
- 緩存預熱支援

### Q3: 性能調優建議？

1. **使用SQLite而非內存**：對於大型專案
2. **啟用FTS5**：提升全文搜索性能
3. **合理設置索引**：只索引常用字段
4. **批量操作**：使用bulkWrite減少IO

## 回滾計劃

如果遷移出現問題：

```bash
# 1. 停止服務
pm2 stop mcp-server

# 2. 恢復備份
cp backup/project-status-manager-rag.js.bak ./project-status-manager-rag.js
cp backup/server.js.bak ./server.js

# 3. 清理新數據
rm -rf ./data/json-rag.db

# 4. 重啟服務
pm2 start mcp-server
```

## 遷移時間表

| 階段 | 時間 | 任務 |
|------|------|------|
| 準備 | 2小時 | 評估、備份、測試環境搭建 |
| 實施 | 4小時 | 代碼修改、數據遷移 |
| 測試 | 2小時 | 功能測試、性能測試 |
| 切換 | 1小時 | 生產環境切換 |
| 監控 | 24小時 | 觀察系統運行 |

## 成功指標

遷移成功的標誌：
- [ ] 所有功能查詢成功率 > 95%
- [ ] 平均查詢延遲 < 20ms
- [ ] Token使用減少 > 80%
- [ ] 無數據丟失
- [ ] 用戶無感知切換

## 總結

從複雜RAG系統遷移到JSON-RAG v5.2是一個值得的投資：
- **簡化架構**：減少90%的代碼複雜度
- **提升性能**：10倍以上的性能提升
- **降低成本**：Token使用減少90%
- **易於維護**：清晰的介面和文檔

遷移過程雖然需要一些工作，但長期收益遠超短期投入。

---

*如有問題，請參考 JSON-RAG v5.2 文檔或聯繫開發團隊*
