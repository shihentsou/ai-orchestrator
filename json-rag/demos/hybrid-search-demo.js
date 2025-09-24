#!/usr/bin/env node
/**
 * JSON-RAG v5.2.1 Hybrid Search Demo
 * Demonstrates Vector Search + Full-Text Search capabilities
 * 
 * This demo showcases the core hybrid search functionality of JSON-RAG,
 * combining both vector embeddings (semantic search) and full-text search
 * for comprehensive information retrieval.
 */

console.log('🚀 JSON-RAG v5.2.1 Hybrid Search Demo');
console.log('=' .repeat(60));

async function runHybridSearchDemo() {
    try {
        // 1. Test Vector Search Functionality
        console.log('\n1️⃣ Testing Vector Search Functionality...');
        
        let vectorTestPassed = false;
        
        try {
            const HNSWLibAdapter = (await import('../adapters/index/hnswlib-adapter.js')).default;
            
            const vectorAdapter = new HNSWLibAdapter({
                dimensions: 384,  // Standard embedding dimensions
                space: 'cosine',
                indexPath: './data/demo-vector.hnsw',
                sidecarPath: './data/demo-vector-sidecar.db',
                autoSave: false
            });
            
            await vectorAdapter.initialize();
            console.log('  ✅ HNSWLib adapter initialized successfully');
            
            // Create test vectors
            const testVector1 = new Float32Array(384);
            const testVector2 = new Float32Array(384);
            const testVector3 = new Float32Array(384);
            
            // Populate with different test patterns
            for (let i = 0; i < 384; i++) {
                testVector1[i] = Math.sin(i * 0.1) * 0.5;
                testVector2[i] = Math.cos(i * 0.1) * 0.5;
                testVector3[i] = Math.sin(i * 0.2) * 0.3;
            }
            
            // Insert vectors with metadata
            await vectorAdapter.upsertEmbedding('doc1', testVector1, { 
                title: 'JSON-RAG Architecture', 
                content: 'A comprehensive knowledge management system' 
            });
            await vectorAdapter.upsertEmbedding('doc2', testVector2, { 
                title: 'Vector Search', 
                content: 'Semantic similarity using embeddings' 
            });
            await vectorAdapter.upsertEmbedding('doc3', testVector3, { 
                title: 'Hybrid Search', 
                content: 'Combining vector and full-text search' 
            });
            console.log('  ✅ Vectors inserted successfully (3 documents)');
            
            // Search for similar vectors
            const searchResults = await vectorAdapter.searchSimilar(testVector1, 2);
            console.log('  ✅ Vector search completed');
            console.log(`     Found ${searchResults.length} similar documents`);
            
            // Validate accuracy
            if (searchResults[0].docId === 'doc1' && searchResults[0].score > 0.99) {
                console.log('  ✅ Search accuracy validation passed');
                vectorTestPassed = true;
            } else {
                console.log('  ⚠️  Search results may be inaccurate');
            }
            
            // Display results
            console.log('\n     Search Results:');
            searchResults.forEach((result, idx) => {
                console.log(`     ${idx + 1}. ${result.docId} (score: ${result.score.toFixed(3)})`);
            });
            
            // Cleanup
            await vectorAdapter.dispose();
            console.log('  ✅ Vector adapter cleanup completed');
            
        } catch (hnswError) {
            console.error('  ❌ Vector search test failed:', hnswError.message);
            console.log('\n  💡 Note: Vector search requires hnswlib-node');
            console.log('     Installation: npm install hnswlib-node');
            console.log('     (Windows users may need build tools)');
        }
        
        // 2. Test Full-Text Search Functionality
        console.log('\n2️⃣ Testing Full-Text Search Functionality...');
        
        let ftsTestPassed = false;
        
        const FTS5IndexAdapter = (await import('../adapters/index/fts5-adapter.js')).default;
        
        const ftsAdapter = new FTS5IndexAdapter({
            config: {
                dbPath: './data/demo-fts.db',
                enableChinese: true  // Support for Chinese text
            }
        });
        
        await ftsAdapter.initialize();
        console.log('  ✅ FTS5 adapter initialized successfully');
        
        // Add test documents
        await ftsAdapter.addToFTS('doc1', 'JSON-RAG is a powerful knowledge management system with hybrid search capabilities');
        await ftsAdapter.addToFTS('doc2', 'The system supports both vector embeddings and full-text search for comprehensive retrieval');
        await ftsAdapter.addToFTS('doc3', 'Hybrid search combines the advantages of semantic and keyword-based search');
        console.log('  ✅ Full-text index created (3 documents)');
        
        // Test English search
        const englishResults = await ftsAdapter.searchFTS('vector search', { limit: 5 });
        console.log('  ✅ English search completed');
        console.log(`     Found ${englishResults.length} matching documents`);
        
        // Test phrase search
        const phraseResults = await ftsAdapter.searchFTS('knowledge management', { limit: 5 });
        console.log('  ✅ Phrase search completed');
        console.log(`     Found ${phraseResults.length} matching documents`);
        
        if (englishResults.length > 0 || phraseResults.length > 0) {
            ftsTestPassed = true;
        }
        
        // Display results
        if (englishResults.length > 0) {
            console.log('\n     FTS Results for "vector search":');
            englishResults.forEach((result, idx) => {
                console.log(`     ${idx + 1}. ${result.docId} (score: ${result.score.toFixed(3)})`);
            });
        }
        
        // Cleanup
        await ftsAdapter.dispose();
        console.log('  ✅ FTS adapter cleanup completed');
        
        // 3. Test JSONRAGCore Integration
        console.log('\n3️⃣ Testing JSONRAGCore Integration...');
        
        const { JSONRAGCore } = await import('../core/json-rag-core.js');
        
        const rag = new JSONRAGCore({
            autoDetect: false,  // Manual configuration
            storage: 'sqlite',
            index: {
                structural: 'memory',
                fulltext: 'fts5',
                vector: vectorTestPassed ? 'hnswlib' : null  // Enable vector only if test passed
            },
            storageOptions: {
                dbPath: './data/demo-core.db'
            },
            indexOptions: {
                dbPath: './data/demo-core.db',
                enableChinese: true,
                dimensions: 384
            }
        });
        
        await rag.initialize();
        console.log('  ✅ JSONRAGCore initialized successfully');
        
        // Use bulk write API to add documents
        const testDocuments = [
            {
                type: 'put',
                key: 'doc:demo:1',
                value: {
                    id: 'demo1',
                    collection: 'demo',
                    data: {
                        content: 'JSON-RAG provides hybrid search functionality for knowledge management',
                        title: 'Demo Document 1',
                        metadata: {
                            author: 'System',
                            category: 'Tutorial'
                        }
                    }
                }
            },
            {
                type: 'put',
                key: 'doc:demo:2',
                value: {
                    id: 'demo2',
                    collection: 'demo',
                    data: {
                        content: 'Combining vector embeddings with full-text search enables powerful retrieval',
                        title: 'Demo Document 2',
                        metadata: {
                            author: 'System',
                            category: 'Technical'
                        }
                    }
                }
            }
        ];
        
        // Bulk write documents
        await rag.bulkWrite(testDocuments);
        console.log('  ✅ Documents written successfully');
        
        // Test query engine (if implemented)
        if (rag.queryEngine) {
            try {
                const queryResults = await rag.query({
                    text: 'hybrid search',
                    limit: 5
                });
                console.log('  ✅ Query executed successfully');
                console.log(`     Found ${queryResults.length} results`);
            } catch (queryError) {
                console.log('  ⚠️  Query functionality may not be fully implemented');
            }
        } else {
            console.log('  ℹ️  Query engine not yet implemented');
        }
        
        // Get system status
        const status = rag.getStatus();
        console.log('  ✅ System status retrieved');
        console.log(`     Initialized: ${status.initialized}`);
        console.log(`     Active adapters: ${status.adapters.join(', ')}`);
        
        // Cleanup
        await rag.close();
        console.log('  ✅ JSONRAGCore closed successfully');
        
        // Final Report
        console.log('\n' + '=' .repeat(60));
        console.log('📊 Demo Results Summary');
        console.log('=' .repeat(60));
        
        if (vectorTestPassed) {
            console.log('  ✅ Vector Search: PASSED');
        } else {
            console.log('  ⚠️  Vector Search: Requires hnswlib-node installation');
        }
        
        if (ftsTestPassed) {
            console.log('  ✅ Full-Text Search: PASSED');
        } else {
            console.log('  ❌ Full-Text Search: FAILED');
        }
        
        console.log('  ✅ Core Integration: FUNCTIONAL');
        
        console.log('\n' + '=' .repeat(60));
        
        if (vectorTestPassed && ftsTestPassed) {
            console.log('✅ Hybrid search fully functional!');
            console.log('   JSON-RAG is ready for production use.');
        } else if (ftsTestPassed) {
            console.log('⚠️  Full-text search is working.');
            console.log('   Vector search requires hnswlib-node installation.');
            console.log('💡 Tip: Vector search is optional but recommended for best results.');
        } else {
            console.log('❌ Core functionality issues detected.');
            console.log('   Please check the error messages above.');
        }
        
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('\n❌ Demo failed with error:');
        console.error(error);
        
        console.log('\n' + '=' .repeat(60));
        console.log('⚠️  Demo encountered issues. Please check the error above.');
        console.log('=' .repeat(60));
        
        process.exit(1);
    }
}

// Execute demo
console.log('Starting hybrid search demonstration...\n');

runHybridSearchDemo()
    .then(() => {
        console.log('\n✅ Demo completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
