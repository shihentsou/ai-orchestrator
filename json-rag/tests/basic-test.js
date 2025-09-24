#!/usr/bin/env node
// basic-test.js - 確保文件存在並可執行
// JSON-RAG v5.2.1 基礎測試
// 2025-09-19

console.log('🧪 JSON-RAG v5.2.1 基礎測試');
console.log('=====================================\n');

import HNSWLibAdapter from '../adapters/index/hnswlib-adapter.js';
import FTS5IndexAdapter from '../adapters/index/fts5-adapter.js';

async function runBasicTest() {
    try {
        console.log('📦 測試適配器導入...');
        
        // 測試向量適配器
        const vectorAdapter = new HNSWLibAdapter({
            dimensions: 10,
            space: 'l2',
            indexPath: './data/test-basic.hnsw',
            sidecarPath: './data/test-basic.db'
        });
        console.log('  ✅ HNSWLibAdapter 導入成功');
        
        // 測試全文適配器
        const ftsAdapter = new FTS5IndexAdapter({
            dbPath: './data/test-basic-fts.db'
        });
        console.log('  ✅ FTS5IndexAdapter 導入成功');
        
        console.log('\n🔧 測試初始化...');
        await vectorAdapter.initialize();
        console.log('  ✅ 向量適配器初始化成功');
        
        await ftsAdapter.initialize();
        console.log('  ✅ 全文適配器初始化成功');
        
        console.log('\n📝 測試基礎操作...');
        
        // 測試向量插入
        const testVector = new Float32Array(10).fill(0.5);
        await vectorAdapter.upsertEmbedding('test-1', testVector, { content: 'test' });
        console.log('  ✅ 向量插入成功');
        
        // 測試向量搜索
        const results = await vectorAdapter.searchSimilar(testVector, 5);
        console.log('  ✅ 向量搜索成功');
        
        // 測試全文索引
        await ftsAdapter.addToFTS('test-1', 'This is a test document', 'test');
        console.log('  ✅ 全文索引成功');
        
        // 測試全文搜索
        const ftsResults = await ftsAdapter.searchFTS('test', 5);
        console.log('  ✅ 全文搜索成功');
        
        console.log('\n🧹 清理資源...');
        await vectorAdapter.dispose();
        await ftsAdapter.dispose();
        console.log('  ✅ 資源清理完成');
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 所有基礎測試通過！');
        console.log('='.repeat(60));
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ 測試失敗:', error);
        process.exit(1);
    }
}

// 執行測試
runBasicTest();
