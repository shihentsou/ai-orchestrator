# JSON-RAG Integration Guide

**Version**: 5.2.1  
**Last Updated**: January 2025

---

## Quick Start

### Installation

```bash
# NPM
npm install json-rag

# Yarn
yarn add json-rag

# PNPM
pnpm add json-rag
```

### Basic Usage

```javascript
import { JsonRagSystem } from 'json-rag';

// Initialize
const rag = new JsonRagSystem({
  dataDir: './data',
  cacheSize: '1GB'
});

// Your first document
await rag.insert({
  content: 'Your text here',
  metadata: { source: 'manual' }
});
```

---

## Integration Patterns

### 1. Personal AI Assistant

Build a smart assistant that remembers everything:

```javascript
class PersonalAssistant {
  constructor() {
    this.rag = new JsonRagSystem({
      dataDir: './assistant-memory'
    });
    this.llm = new YourLLMClient();
  }

  async remember(interaction) {
    // Generate embedding
    const embedding = await this.llm.embed(interaction.text);
    
    // Store with context
    await this.rag.insert({
      id: `memory-${Date.now()}`,
      content: interaction.text,
      embedding: embedding,
      metadata: {
        timestamp: new Date(),
        type: interaction.type,
        sentiment: interaction.sentiment
      }
    });
  }

  async recall(query, limit = 5) {
    // Get query embedding
    const queryEmbedding = await this.llm.embed(query);
    
    // Search memories
    const memories = await this.rag.search({
      vector: queryEmbedding,
      limit: limit,
      threshold: 0.7
    });
    
    // Build context for LLM
    const context = memories
      .map(m => m.content)
      .join('\n\n');
    
    return this.llm.complete({
      prompt: query,
      context: context
    });
  }
}
```

### 2. Document Q&A System

Create a system that answers questions from your documents:

```javascript
class DocumentQA {
  constructor() {
    this.rag = new JsonRagSystem({
      collections: {
        documents: {
          vectorDim: 1536,
          enableFTS: true
        }
      }
    });
  }

  async ingestDocument(filepath) {
    const content = await fs.readFile(filepath, 'utf-8');
    const chunks = this.splitIntoChunks(content, 500);
    
    // Process chunks in parallel
    const embeddings = await Promise.all(
      chunks.map(chunk => this.llm.embed(chunk))
    );
    
    // Batch insert
    await this.rag.batchInsert(
      chunks.map((chunk, i) => ({
        content: chunk,
        embedding: embeddings[i],
        metadata: {
          source: filepath,
          chunkIndex: i
        }
      }))
    );
  }

  async answer(question) {
    // Hybrid search: vector + keyword
    const results = await this.rag.hybridSearch({
      text: question,
      vector: await this.llm.embed(question),
      weights: { vector: 0.7, text: 0.3 },
      limit: 3
    });
    
    if (results.length === 0) {
      return "I couldn't find relevant information.";
    }
    
    // Generate answer
    return this.llm.complete({
      system: 'Answer based on the provided context.',
      context: results.map(r => r.content).join('\n'),
      question: question
    });
  }
}
```

### 3. Knowledge Graph Builder

Build relationships between your data:

```javascript
class KnowledgeGraph {
  constructor() {
    this.rag = new JsonRagSystem({
      enableGraph: true
    });
  }

  async addEntity(entity) {
    const embedding = await this.getEmbedding(entity.description);
    
    return this.rag.insert({
      type: 'entity',
      name: entity.name,
      category: entity.category,
      embedding: embedding,
      attributes: entity.attributes
    });
  }

  async linkEntities(entity1Id, entity2Id, relationship) {
    return this.rag.createRelationship({
      from: entity1Id,
      to: entity2Id,
      type: relationship,
      metadata: {
        created: new Date(),
        confidence: 1.0
      }
    });
  }

  async findRelated(entityName, depth = 2) {
    // Find entity
    const entity = await this.rag.search({
      text: entityName,
      type: 'entity',
      limit: 1
    });
    
    if (!entity.length) return null;
    
    // Traverse graph
    return this.rag.traverseGraph({
      startNode: entity[0].id,
      depth: depth,
      includeEmbeddings: true
    });
  }
}
```

---

## Advanced Features

### Incremental Learning

Update your knowledge base without full reprocessing:

```javascript
class IncrementalLearner {
  async updateKnowledge(newInfo) {
    // Check if similar knowledge exists
    const existing = await this.rag.search({
      vector: await this.embed(newInfo),
      threshold: 0.95,
      limit: 1
    });
    
    if (existing.length > 0) {
      // Update existing knowledge
      await this.rag.update(existing[0].id, {
        content: this.mergeKnowledge(existing[0].content, newInfo),
        lastUpdated: new Date()
      });
    } else {
      // Add new knowledge
      await this.rag.insert({
        content: newInfo,
        embedding: await this.embed(newInfo)
      });
    }
  }
}
```

### Multi-Modal Storage

Store text, images, and structured data together:

```javascript
class MultiModalStore {
  async storeItem(item) {
    const doc = {
      id: item.id,
      type: item.type
    };
    
    switch (item.type) {
      case 'text':
        doc.content = item.text;
        doc.embedding = await this.embedText(item.text);
        break;
        
      case 'image':
        doc.imagePath = await this.saveImage(item.imageData);
        doc.embedding = await this.embedImage(item.imageData);
        doc.description = item.description;
        break;
        
      case 'structured':
        doc.data = item.data;
        doc.searchableText = this.structuredToText(item.data);
        doc.embedding = await this.embedText(doc.searchableText);
        break;
    }
    
    return this.rag.insert(doc);
  }
}
```

---

## Performance Optimization

### Batch Operations

Always use batch operations for multiple documents:

```javascript
// ❌ Slow: Individual inserts
for (const doc of documents) {
  await rag.insert(doc);
}

// ✅ Fast: Batch insert
await rag.batchInsert(documents);
```

### Embedding Caching

Cache embeddings to avoid recomputation:

```javascript
class EmbeddingCache {
  constructor() {
    this.cache = new Map();
  }
  
  async getEmbedding(text) {
    const hash = crypto.createHash('md5').update(text).digest('hex');
    
    if (!this.cache.has(hash)) {
      this.cache.set(hash, await this.llm.embed(text));
    }
    
    return this.cache.get(hash);
  }
}
```

### Index Optimization

Configure indexes based on your query patterns:

```javascript
const rag = new JsonRagSystem({
  indexes: {
    // Optimize for vector search
    vector: {
      algorithm: 'hnsw',
      m: 16,
      efConstruction: 200
    },
    // Optimize for text search
    text: {
      tokenizer: 'unicode61',
      prefixSearch: true
    }
  }
});
```

---

## Deployment Options

### Desktop Application

```javascript
// Electron app example
const { app, BrowserWindow } = require('electron');
const { JsonRagSystem } = require('json-rag');

let rag;

app.whenReady().then(() => {
  rag = new JsonRagSystem({
    dataDir: app.getPath('userData') + '/rag-data'
  });
  
  createWindow();
});
```

### Mobile App (React Native)

```javascript
import { JsonRagSystem } from 'json-rag';
import AsyncStorage from '@react-native-async-storage/async-storage';

const rag = new JsonRagSystem({
  storage: AsyncStorage,
  platform: 'react-native'
});
```

### Web Browser (PWA)

```javascript
// Service Worker
import { JsonRagSystem } from 'json-rag';

const rag = new JsonRagSystem({
  storage: 'indexeddb',
  persistent: true
});

// Handle offline queries
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/search')) {
    event.respondWith(handleOfflineSearch(event.request));
  }
});
```

### Edge Functions

```javascript
// Cloudflare Worker
export default {
  async fetch(request, env) {
    const rag = new JsonRagSystem({
      storage: env.KV,
      region: request.cf.colo
    });
    
    // Handle request
    return handleSearch(request, rag);
  }
};
```

---

## Error Handling

### Graceful Degradation

```javascript
class ResilientRAG {
  async search(query) {
    try {
      // Try hybrid search first
      return await this.rag.hybridSearch(query);
    } catch (error) {
      console.warn('Hybrid search failed, falling back', error);
      
      try {
        // Fall back to vector search
        return await this.rag.vectorSearch(query);
      } catch (error) {
        console.warn('Vector search failed, falling back', error);
        
        // Final fallback to text search
        return await this.rag.textSearch(query);
      }
    }
  }
}
```

### Recovery Strategies

```javascript
// Auto-recovery from corruption
const rag = new JsonRagSystem({
  autoRecover: true,
  backupInterval: '1h',
  onError: async (error) => {
    if (error.type === 'corruption') {
      await rag.restoreFromBackup();
    }
  }
});
```

---

## Testing

### Unit Testing

```javascript
import { JsonRagSystem } from 'json-rag';
import { describe, it, expect } from 'vitest';

describe('RAG System', () => {
  it('should find similar documents', async () => {
    const rag = new JsonRagSystem({ memory: true });
    
    await rag.insert({
      content: 'Machine learning is fascinating',
      embedding: [0.1, 0.2, 0.3]
    });
    
    const results = await rag.search({
      vector: [0.1, 0.2, 0.4],
      threshold: 0.8
    });
    
    expect(results).toHaveLength(1);
  });
});
```

### Performance Testing

```javascript
async function benchmark() {
  const rag = new JsonRagSystem();
  const documents = generateTestDocuments(10000);
  
  console.time('Batch Insert');
  await rag.batchInsert(documents);
  console.timeEnd('Batch Insert');
  
  console.time('Vector Search');
  await rag.search({ 
    vector: randomVector(),
    limit: 10 
  });
  console.timeEnd('Vector Search');
}
```

---

## Migration Guide

### From Pinecone

```javascript
// Export from Pinecone
const vectors = await pinecone.index('my-index').query({
  includeVectors: true,
  includeMetadata: true
});

// Import to JSON-RAG
await rag.batchInsert(
  vectors.matches.map(match => ({
    id: match.id,
    embedding: match.values,
    metadata: match.metadata
  }))
);
```

### From ChromaDB

```javascript
// Export from Chroma
const collection = await chroma.getCollection('my-collection');
const data = await collection.get();

// Import to JSON-RAG
await rag.batchInsert(
  data.documents.map((doc, i) => ({
    content: doc,
    embedding: data.embeddings[i],
    metadata: data.metadatas[i]
  }))
);
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Slow searches** | Reduce vector dimensions, add indexes |
| **High memory usage** | Enable disk-based caching, reduce cache size |
| **Import failures** | Check data format, use batch processing |
| **Corrupted data** | Enable auto-backup, use recovery mode |

### Debug Mode

```javascript
const rag = new JsonRagSystem({
  debug: true,
  logLevel: 'verbose',
  onQuery: (query, results, timing) => {
    console.log(`Query took ${timing.ms}ms, found ${results.length} results`);
  }
});
```

---

## Support

- **GitHub**: [json-rag/json-rag](https://github.com/json-rag/json-rag)
- **Discord**: [Join our community](https://discord.gg/json-rag)
- **Documentation**: [docs.json-rag.dev](https://docs.json-rag.dev)

---

*For market analysis and positioning, see the [JSON-RAG Market Positioning](./JSON-RAG-Market-Positioning.md)*