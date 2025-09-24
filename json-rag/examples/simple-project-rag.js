/**
 * 示例：使用JSON-RAG v5.2替代MCP Server的複雜RAG系統
 * 這個例子展示了如何用簡單直接的方式實現功能22的需求
 */

import { createJSONRAG } from '../core/json-rag-core.js';

/**
 * 功能22專用的簡化RAG包裝器
 */
export class SimpleProjectRAG {
  constructor() {
    this.jsonRAG = null;
    this.projectId = 'mcp_server_dev';
    
    // 功能映射表（從簡單RAG系統學到的經驗）
    this.featureMapping = {
      '功能1': 'features/feature_1.json',
      '功能2': 'features/feature_2.json',
      '功能3': 'features/feature_3.json',
      '功能4': 'features/feature_4.json',
      '功能5': 'features/feature_5.json',
      '功能6': 'features/feature_6.json',
      '功能7': 'features/feature_7.json',
      '功能8': 'features/feature_8.json',
      '功能9': 'features/feature_9.json',
      '功能10': 'features/feature_10.json',
      '功能11': 'features/feature_11.json',
      '功能12': 'features/feature_12.json',
      '功能13': 'features/feature_13.json',
      '功能14': 'features/feature_14.json',
      '功能15': 'features/feature_15.json',
      '功能16': 'features/feature_16.json',
      '功能20': 'features/feature_20.json',
      '功能21': 'features/feature_21.json',
      '功能22': 'features/feature_22.json',
      'gpt5': 'features/feature_21.json',
      'gpt-5': 'features/feature_21.json',
      'universal_ai_adapter': 'features/feature_21.json',
      'automation_orchestrator': 'features/feature_20.json',
      'find_project_status': 'features/feature_22.json'
    };
  }

  /**
   * 初始化
   */
  async initialize() {
    // 創建JSON-RAG實例
    this.jsonRAG = createJSONRAG({
      storage: 'memory',  // 對於功能22，內存足夠
      index: {
        structural: 'memory',
        fulltext: 'memory'
        // 不需要向量索引，功能22主要是精確查詢
      },
      cache: 'memory'
    });

    await this.jsonRAG.initialize();

    // 載入現有的專案狀態
    await this.loadExistingData();
  }

  /**
   * 載入現有數據
   */
  async loadExistingData() {
    // 這裡應該從實際的專案狀態檔案載入
    // 簡化示例
    
    // 載入元數據
    await this.jsonRAG.put('metadata', this.projectId, {
      project_name: 'MCP Server v2.4開發',
      version: 'v3.1.48',
      last_updated: new Date().toISOString()
    });

    // 載入功能資訊
    for (const [keyword, path] of Object.entries(this.featureMapping)) {
      await this.jsonRAG.put('features', keyword, {
        keyword,
        path,
        type: 'feature_reference'
      });
    }
  }

  /**
   * 查詢專案狀態
   * @param {string} query - 查詢內容
   * @returns {Object} 查詢結果
   */
  async query(query) {
    const startTime = Date.now();
    
    // 1. 先嘗試直接關鍵字匹配
    const directMatch = await this.directMatch(query);
    if (directMatch) {
      return {
        results: [directMatch],
        source: 'direct_match',
        latency: Date.now() - startTime
      };
    }

    // 2. 全文搜索
    const searchResults = await this.jsonRAG.search({
      semantic: { query },
      structural: { collection: 'features' }
    });

    if (searchResults.results.length > 0) {
      return {
        results: searchResults.results,
        source: 'fulltext_search',
        latency: Date.now() - startTime
      };
    }

    // 3. 降級到所有功能列表
    const allFeatures = await this.jsonRAG.search({
      structural: { collection: 'features' }
    });

    return {
      results: allFeatures.results,
      source: 'all_features',
      latency: Date.now() - startTime
    };
  }

  /**
   * 直接匹配
   */
  async directMatch(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    // 檢查功能映射
    for (const [keyword, path] of Object.entries(this.featureMapping)) {
      if (normalizedQuery.includes(keyword.toLowerCase())) {
        return {
          keyword,
          path,
          matched: true,
          score: 1.0
        };
      }
    }

    return null;
  }

  /**
   * 更新專案狀態
   * @param {string} key - 更新的鍵
   * @param {Object} data - 更新的數據
   */
  async update(key, data) {
    // 使用JSON-RAG的更新機制
    await this.jsonRAG.put('project_state', key, {
      ...data,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * 獲取系統狀態
   */
  getStatus() {
    return this.jsonRAG.getStatus();
  }
}

// 示例使用
async function example() {
  console.log('=== SimpleProjectRAG 示例 ===\n');

  const rag = new SimpleProjectRAG();
  await rag.initialize();

  // 測試查詢
  const testQueries = [
    '功能21',
    'gpt-5',
    'universal_ai_adapter',
    '功能22',
    'automation'
  ];

  for (const query of testQueries) {
    console.log(`查詢: "${query}"`);
    const result = await rag.query(query);
    console.log(`結果: ${result.results.length} 個匹配`);
    console.log(`來源: ${result.source}`);
    console.log(`延遲: ${result.latency}ms`);
    if (result.results.length > 0) {
      console.log(`第一個結果:`, result.results[0]);
    }
    console.log('---');
  }

  console.log('\n系統狀態:');
  console.log(rag.getStatus());
}

// 如果直接運行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}

export default SimpleProjectRAG;
