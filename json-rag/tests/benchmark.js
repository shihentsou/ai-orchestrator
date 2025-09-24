#!/usr/bin/env node
// benchmark.js
// JSON-RAG v5.2.1 性能基準測試
// 2025-09-19

import HNSWLibAdapter from '../adapters/index/hnswlib-adapter.js';
import FTS5IndexAdapter from '../adapters/index/fts5-adapter.js';
import LocalEmbedder from '../embedders/local-embedder.js';
import { performance } from 'perf_hooks';

console.log('⚡ JSON-RAG v5.2.1 性能基準測試');
console.log('=====================================\n');

async function benchmark() {
    const results = {};
    
    console.log('📦 初始化測試環境...');
    
    // 初始化向量適配器
    const vectorAdapter = new HNSWLibAdapter({
        dimensions: 384,
        space: 'ip',
        indexPath: './data/benchmark-vector.hnsw',
        sidecarPath: './data/benchmark-vector.db',
        autoSave: false
    });
    await vectorAdapter.initialize();
    
    // 初始化全文適配器
    const ftsAdapter = new FTS5IndexAdapter({
        dbPath: './data/benchmark-fts.db'
    });
    await ftsAdapter.initialize();
    
    // 初始化嵌入模型
    const embedder = new LocalEmbedder();
    await embedder.initialize();
    
    console.log('✅ 環境初始化完成\n');
    
    // 測試數據準備
    const testSizes = [10, 50, 100, 500];
    const testDocs = [];
    for (let i = 0; i < 500; i++) {
        testDocs.push({
            id: `doc-${i}`,
            content: `This is test document ${i}. It contains some sample text for testing the performance of JSON-RAG system. The content includes various keywords and phrases to test search functionality.`,
            metadata: { index: i, type: 'test' }
        });
    }
    
    // 測試向量插入性能
    console.log('📝 測試向量插入性能...');
    for (const size of testSizes) {
        const docs = testDocs.slice(0, size);
        const start = performance.now();
        
        for (const doc of docs) {
            const vector = await embedder.embed(doc.content);
            await vectorAdapter.upsertEmbedding(doc.id, vector, doc.metadata);
        }
        
        const duration = performance.now() - start;
        const avgTime = duration / size;
        
        results[`vector_insert_${size}`] = {
            totalTime: duration.toFixed(2),
            avgTime: avgTime.toFixed(2),
            docsPerSecond: (1000 / avgTime).toFixed(2)
        };
        
        console.log(`  ${size} 文檔: ${duration.toFixed(2)}ms (平均 ${avgTime.toFixed(2)}ms/doc)`);
        
        // 清理
        await vectorAdapter.clear();
    }
    
    // 測試向量搜索性能
    console.log('\n🔍 測試向量搜索性能...');
    
    // 先插入測試數據
    for (let i = 0; i < 100; i++) {
        const doc = testDocs[i];
        const vector = await embedder.embed(doc.content);
        await vectorAdapter.upsertEmbedding(doc.id, vector, doc.metadata);
    }
    
    const searchQueries = [
        'test document performance',
        'JSON-RAG system',
        'search functionality',
        'sample text testing'
    ];
    
    let totalSearchTime = 0;
    for (const query of searchQueries) {
        const queryVector = await embedder.embed(query);
        const start = performance.now();
        
        const results = await vectorAdapter.searchSimilar(queryVector, 10);
        
        const duration = performance.now() - start;
        totalSearchTime += duration;
    }
    
    const avgSearchTime = totalSearchTime / searchQueries.length;
    results.vector_search = {
        avgTime: avgSearchTime.toFixed(2),
        queriesPerSecond: (1000 / avgSearchTime).toFixed(2)
    };
    
    console.log(`  平均搜索時間: ${avgSearchTime.toFixed(2)}ms`);
    console.log(`  吞吐量: ${(1000 / avgSearchTime).toFixed(2)} queries/sec`);
    
    // 測試全文搜索性能
    console.log('\n📖 測試全文搜索性能...');
    
    // 插入測試數據到FTS
    for (const doc of testDocs.slice(0, 100)) {
        await ftsAdapter.addToFTS(doc.id, doc.content, 'benchmark');
    }
    
    let totalFTSTime = 0;
    for (const query of searchQueries) {
        const start = performance.now();
        
        const results = await ftsAdapter.searchFTS(query, 10, { collection: 'benchmark' });
        
        const duration = performance.now() - start;
        totalFTSTime += duration;
    }
    
    const avgFTSTime = totalFTSTime / searchQueries.length;
    results.fts_search = {
        avgTime: avgFTSTime.toFixed(2),
        queriesPerSecond: (1000 / avgFTSTime).toFixed(2)
    };
    
    console.log(`  平均搜索時間: ${avgFTSTime.toFixed(2)}ms`);
    console.log(`  吞吐量: ${(1000 / avgFTSTime).toFixed(2)} queries/sec`);
    
    // 測試索引持久化性能
    console.log('\n💾 測試索引持久化性能...');
    
    const saveStart = performance.now();
    await vectorAdapter.saveIndex();
    const saveDuration = performance.now() - saveStart;
    
    results.persistence = {
        saveTime: saveDuration.toFixed(2)
    };
    
    console.log(`  索引保存時間: ${saveDuration.toFixed(2)}ms`);
    
    // 輸出總結
    console.log('\n' + '='.repeat(60));
    console.log('📊 性能基準測試總結');
    console.log('='.repeat(60));
    
    console.log('\n向量插入性能:');
    for (const size of testSizes) {
        const result = results[`vector_insert_${size}`];
        console.log(`  ${size} 文檔: ${result.docsPerSecond} docs/sec`);
    }
    
    console.log('\n搜索性能:');
    console.log(`  向量搜索: ${results.vector_search.queriesPerSecond} queries/sec`);
    console.log(`  全文搜索: ${results.fts_search.queriesPerSecond} queries/sec`);
    
    console.log('\n持久化性能:');
    console.log(`  索引保存: ${results.persistence.saveTime}ms`);
    
    // 清理資源
    await vectorAdapter.dispose();
    await ftsAdapter.dispose();
    await embedder.dispose();
    
    console.log('\n✅ 基準測試完成！');
}

// 執行基準測試
benchmark().catch(error => {
    console.error('基準測試失敗:', error);
    process.exit(1);
});
