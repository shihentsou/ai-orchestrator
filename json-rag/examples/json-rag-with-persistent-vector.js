// examples/json-rag-with-persistent-vector.js
// JSON-RAG整合持久化向量索引完整示例
// v5.2.1 - 2025-09-17

import { JSONRAGCore } from '../core/json-rag-core.js';
import HNSWLibAdapter from '../adapters/index/hnswlib-adapter.js';
import LocalEmbedder from '../embedders/local-embedder.js';
import VectorManager from '../core/vector-manager.js';
import { createVectorIndexConfig } from '../config/vector-config.js';

/**
 * 創建具有持久化向量支援的JSON-RAG實例
 */
async function createEnhancedJSONRAG(options = {}) {
  // 創建核心實例
  const rag = new JSONRAGCore({
    storage: 'sqlite',
    index: {
      structural: 'sqlite',
      fulltext: 'fts5'
    },
    ...options
  });
  
  // 初始化核心
  await rag.initialize();
  
  // 添加向量層支援
  if (options.enableVectorSearch) {
    // 創建嵌入器
    const embedder = new LocalEmbedder({
      modelName: options.embeddingModel || 'Xenova/all-MiniLM-L6-v2',
      cachePath: options.modelCachePath || './models',
      normalize: true
    });
    await embedder.initialize();
    
    // 創建持久化向量索引
    const vectorConfig = createVectorIndexConfig({
      indexPath: options.vectorIndexPath || './data/json-rag-vector.hnsw',
      sidecarPath: options.vectorSidecarPath || './data/json-rag-vector.db',
      ...options.vectorConfig
    });
    
    const vectorAdapter = new HNSWLibAdapter(vectorConfig);
    await vectorAdapter.initialize();
    
    // 創建向量管理器
    const vectorManager = new VectorManager({
      embedder,
      indexAdapter: vectorAdapter,
      minLengthForEmbedding: options.minLengthForEmbedding || 100,
      skipTypes: options.skipEmbeddingTypes || ['config', 'metadata'],
      autoRebuild: true
    });
    await vectorManager.initialize();
    
    // 掛載到RAG實例
    rag.adapters.vector = vectorAdapter;
    rag.vectorManager = vectorManager;
    
    // 增強查詢引擎
    if (rag.queryEngine) {
      rag.queryEngine.vectorManager = vectorManager;
    }
    
    console.log('✅ 向量層已啟用（持久化存儲）');
  }
  
  return rag;
}

/**
 * 主示例函數
 */
async function main() {
  console.log('===== JSON-RAG v5.2.1 完整示例（含持久化向量） =====\n');
  
  try {
    // 1. 創建增強的JSON-RAG實例
    console.log('1. 初始化JSON-RAG系統...');
    const rag = await createEnhancedJSONRAG({
      enableVectorSearch: true,
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      vectorIndexPath: './data/demo-vector.hnsw',
      vectorSidecarPath: './data/demo-vector.db',
      minLengthForEmbedding: 50,
      vectorConfig: {
        autoSave: true,
        autoSaveInterval: 30000
      }
    });
    
    // 2. 準備示例數據
    const documents = [
      {
        collection: 'knowledge',
        id: 'json-rag-intro',
        data: {
          title: 'JSON-RAG系統介紹',
          content: 'JSON-RAG是一個革命性的知識管理系統，結合了結構化查詢、全文搜索和語義理解三大能力。它採用六角架構設計，具有極高的擴展性和可維護性。',
          tags: ['json-rag', 'knowledge-management', 'architecture'],
          created: new Date('2025-09-15').toISOString()
        }
      },
      {
        collection: 'technical',
        id: 'vector-search',
        data: {
          title: '向量搜索技術詳解',
          content: '向量搜索通過將文本轉換為高維向量，使用餘弦相似度或內積來計算語義相似性。HNSW算法提供了高效的近似最近鄰搜索能力。',
          tags: ['vector-search', 'hnsw', 'semantic-search'],
          created: new Date('2025-09-16').toISOString()
        }
      },
      {
        collection: 'feature',
        id: 'persistent-storage',
        data: {
          title: '持久化存儲的優勢',
          content: '持久化向量存儲確保系統重啟後向量索引仍然可用，避免重新計算的開銷。側車存儲模式解決了HNSW無法存儲原始向量的問題。',
          tags: ['persistent-storage', 'vector-index', 'sidecar-pattern'],
          created: new Date('2025-09-17').toISOString()
        }
      },
      {
        collection: 'tutorial',
        id: 'hybrid-search',
        data: {
          title: '混合搜索策略',
          content: '混合搜索結合了結構化篩選、全文匹配和語義理解。filter-first策略適合精確查詢，semantic-first適合探索性搜索，parallel策略平衡準確性和召回率。',
          tags: ['hybrid-search', 'query-strategy', 'optimization'],
          created: new Date('2025-09-17').toISOString()
        }
      }
    ];
    
    // 3. 添加文檔到系統
    console.log('\n2. 添加文檔到系統...');
    for (const doc of documents) {
      console.log(`  添加: ${doc.collection}/${doc.id}`);
      
      // 添加到JSON-RAG
      await rag.put(doc.collection, doc.id, doc.data);
      
      // 生成並添加向量（如果啟用）
      if (rag.vectorManager) {
        const content = `${doc.data.title}. ${doc.data.content}`;
        const shouldEmbed = await rag.vectorManager.shouldCreateEmbedding({
          id: `${doc.collection}:${doc.id}`,
          type: doc.collection,
          content
        });
        
        if (shouldEmbed) {
          await rag.vectorManager.createEmbedding({
            id: `${doc.collection}:${doc.id}`,
            type: doc.collection,
            content,
            data: doc.data
          });
        }
      }
    }
    
    // 保存向量索引
    if (rag.adapters.vector) {
      await rag.adapters.vector.saveIndex();
    }
    
    // 4. 演示不同的搜索策略
    console.log('\n3. 執行各種搜索策略...');
    
    // 4.1 結構化查詢
    console.log('\n--- 結構化查詢 ---');
    const structuralResults = await rag.search({
      structural: {
        collection: 'technical'
      }
    });
    console.log('技術類文檔:');
    structuralResults.results.forEach(r => {
      console.log(`  - ${r.id}: ${r.data.title}`);
    });
    
    // 4.2 全文搜索
    console.log('\n--- 全文搜索 ---');
    const ftsResults = await rag.search({
      structural: {
        query: '向量 存儲'
      }
    });
    console.log('包含"向量 存儲"的文檔:');
    ftsResults.results.forEach(r => {
      console.log(`  - ${r.id}: ${r.data.title}`);
    });
    
    // 4.3 語義搜索
    if (rag.vectorManager) {
      console.log('\n--- 語義搜索 ---');
      const semanticQuery = '如何實現高效的相似性搜索？';
      console.log(`查詢: "${semanticQuery}"`);
      
      const queryVector = await rag.vectorManager.embedder.embed(semanticQuery);
      const semanticResults = await rag.adapters.vector.searchSimilar(queryVector, 3, {
        fetchMetadata: true
      });
      
      console.log('語義相關文檔:');
      semanticResults.forEach((r, i) => {
        const docId = r.docId.split(':')[1];
        const collection = r.docId.split(':')[0];
        console.log(`  ${i + 1}. ${docId} (相似度: ${(r.score * 100).toFixed(1)}%)`);
      });
    }
    
    // 4.4 混合搜索
    console.log('\n--- 混合搜索 ---');
    const hybridResults = await rag.search({
      structural: {
        collection: ['technical', 'tutorial']
      },
      semantic: {
        query: '向量搜索的實現方法',
        useEmbedding: true,
        k: 5
      }
    });
    console.log('混合搜索結果:');
    if (hybridResults.results) {
      hybridResults.results.forEach(r => {
        console.log(`  - ${r.id}: ${r.data?.title || 'N/A'}`);
      });
    }
    
    // 5. 更新文檔
    console.log('\n4. 更新文檔...');
    await rag.put('knowledge', 'json-rag-intro', {
      title: 'JSON-RAG v5.2.1系統介紹',
      content: 'JSON-RAG v5.2.1新增了持久化向量存儲功能，使用HNSW算法和側車存儲模式，大幅提升了系統的性能和可靠性。',
      tags: ['json-rag', 'v5.2.1', 'persistent-vector'],
      created: new Date('2025-09-15').toISOString(),
      updated: new Date().toISOString()
    });
    console.log('✅ 文檔已更新');
    
    // 6. 獲取系統狀態
    console.log('\n5. 系統狀態...');
    const status = rag.getStatus();
    console.log('系統指標:');
    console.log(`  文檔總數: ${status.metrics.documentsCount}`);
    console.log(`  數據大小: ${(status.metrics.totalSize / 1024).toFixed(2)} KB`);
    console.log(`  查詢次數: ${status.metrics.queryCount}`);
    console.log(`  緩存命中: ${status.metrics.cacheHits}`);
    console.log(`  緩存未中: ${status.metrics.cacheMisses}`);
    
    if (rag.adapters.vector) {
      const vectorStats = await rag.adapters.vector.getStats();
      console.log('\n向量索引狀態:');
      console.log(`  活躍向量: ${vectorStats.activeVectors}`);
      console.log(`  刪除向量: ${vectorStats.deletedVectors}`);
      console.log(`  刪除率: ${(vectorStats.deletionRatio * 100).toFixed(1)}%`);
    }
    
    // 7. 健康檢查
    if (rag.adapters.vector) {
      console.log('\n6. 向量索引健康檢查...');
      const health = await rag.adapters.vector.healthCheck();
      console.log(`  狀態: ${health.healthy ? '✅ 健康' : '⚠️ 需要維護'}`);
      if (health.issues && health.issues.length > 0) {
        console.log('  問題:');
        health.issues.forEach(issue => {
          console.log(`    - ${issue}`);
        });
      }
    }
    
    // 8. 創建快照
    console.log('\n7. 創建系統快照...');
    const snapshot = await rag.createSnapshot();
    console.log('✅ 快照已創建');
    
    // 9. 清理資源
    console.log('\n8. 清理資源...');
    await rag.close();
    console.log('✅ 資源已釋放');
    
    console.log('\n===== 示例完成 =====');
    
  } catch (error) {
    console.error('\n❌ 發生錯誤:', error);
    process.exit(1);
  }
}

// 執行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('開始執行JSON-RAG完整示例...\n');
  main().catch(console.error);
}

// 導出功能供其他模組使用
export { createEnhancedJSONRAG };
