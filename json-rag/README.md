# JSON-RAG v5.2.1

> **A Knowledge Graph-native RAG system (JSON-KG) that combines vector search, full-text search, and graph traversal for true 3D cognitive memory**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Knowledge Graph](https://img.shields.io/badge/Knowledge%20Graph-Native-green)](https://github.com)
[![Memory Type](https://img.shields.io/badge/Memory-3D%20Cognitive-blue)](https://github.com)

## 🌟 Overview

**JSON-RAG = JSON + Knowledge Graph + RAG**, providing native graph database capabilities alongside vector and full-text search. While other memory systems offer flat storage, JSON-RAG enables relationship queries, pattern discovery, and multi-hop reasoning.

### Core Architecture: Triple-Layer Intelligence
```
Vector Search (Semantic) + FTS5 (Precision) + Knowledge Graph (Relationships) = 3D Understanding
```

## 🏆 Technical Comparison

| Feature | JSON-RAG | MemGPT/Mem0 | LangChain Memory |
|---------|----------|-------------|-----------------|
| **Architecture** | Native KG + Vector + FTS | Vector/SQLite | Pluggable backends |
| **Relationship Queries** | ✅ N-hop traversal | ❌ | ⚠️ Limited |
| **Pattern Discovery** | ✅ Graph algorithms | ❌ | ❌ |
| **Query Dimensions** | 3D (semantic+text+graph) | 2D/1D | 2D |
| **Causal Reasoning** | ✅ Path analysis | ❌ | ❌ |

## 🚀 Features

### Knowledge Graph Capabilities
- **Entity-Relationship Management**: Store and query complex networks natively
- **Graph Traversal**: N-hop queries, shortest path, community detection
- **Pattern Discovery**: Identify hidden relationships and clusters
- **Causal Analysis**: Trace cause-effect chains through the graph

### Production-Ready Search
- **Hybrid Search**: Simultaneous semantic, keyword, and graph queries
- **Multilingual Support**: Built-in Chinese tokenization and search
- **Flexible Storage**: SQLite, memory, or custom adapters
- **384-dimension embeddings**: Compatible with all-MiniLM-L6-v2 (configurable)
- **Windows-optimized**: Special file handling for Windows environments

## 📦 Installation

```bash
# Clone and install
git clone https://github.com/shihentsou/ai-orchestrator.git
cd ai-orchestrator/json-rag
npm install

# Optional: Vector search support
npm install hnswlib-node
```

**Windows users**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) for hnswlib-node

## 🎯 Quick Start

### Basic Usage
```javascript
import { JSONRAGCore } from './core/json-rag-core.js';

const rag = new JSONRAGCore({
    storage: 'sqlite',
    index: {
        structural: 'memory',
        fulltext: 'fts5',
        vector: 'hnswlib'
    },
    enableKnowledgeGraph: true  // Enable native KG features
});

await rag.initialize();

// Traditional document operations
await rag.bulkWrite([{
    type: 'put',
    key: 'doc:1',
    value: {
        id: '1',
        content: 'JSON-RAG enables graph-based knowledge management',
        metadata: { category: 'tech' }
    }
}]);

// Knowledge Graph operations (native support)
await rag.kg.addEntity('person:alice', {
    name: 'Alice',
    role: 'Researcher'
});

await rag.kg.addRelationship('person:alice', 'studies', 'topic:llm', {
    since: '2023',
    papers: 5
});

// Multi-hop graph traversal
const network = await rag.kg.traverse({
    from: 'person:alice',
    hops: 3,
    relationTypes: ['studies', 'collaborates']
});
```

## 🌐 Architecture

```
Flat Vector DB (2D):  Documents → Embeddings → Similarity → Results

JSON-RAG/JSON-KG (3D):
     ┌─────────────────────────────────────┐
     │      Native Knowledge Graph          │
     │  • Entity-Relationship Storage       │
     │  • Graph Algorithms & Traversal      │
     └────────────┬────────────────────────┘
                  │
     ┌────────────▼────────────────────────┐
     │      Hybrid Query Engine            │
     │    (Vector + FTS + Graph)           │
     └────────────┬────────────────────────┘
                  │
         ┌────────┴────────┬───────────┐
         ▼                 ▼           ▼
    ┌─────────┐     ┌──────────┐  ┌────────┐
    │ Vector  │     │   FTS5   │  │ Graph  │
    │  Index  │     │  Search  │  │  Store │
    └─────────┘     └──────────┘  └────────┘
```

## 🎮 Real-World Applications

### Medical/Clinical Research
- **Flat Search**: Find similar symptoms
- **JSON-KG**: Discover drug→gene→protein→symptom causal pathways

### Financial Analysis  
- **Flat Search**: Find similar stocks
- **JSON-KG**: Map ownership networks, money flows, cascade effects

### AI Agent Memory
- **Flat Search**: Retrieve similar conversations
- **JSON-KG**: Build cognitive maps, connect disparate memories, understand patterns

## 📂 Project Structure

```
json-rag/
├── core/                    # Core system components
│   ├── json-rag-core.js    # Main entry point
│   └── kg-engine.js        # Native Knowledge Graph engine
├── adapters/               # Pluggable adapters
│   ├── storage/           # Storage backends
│   └── index/             # Index implementations
└── demos/                 # Runnable examples
```

## 🔧 Configuration

```javascript
{
    // Standard configuration
    storage: 'sqlite',
    index: {
        structural: 'memory',
        fulltext: 'fts5',
        vector: 'hnswlib'
    },
    
    // Knowledge Graph configuration
    knowledgeGraph: {
        enabled: true,
        maxHops: 5,
        algorithms: ['pagerank', 'community', 'shortest_path']
    },
    
    // Vector configuration
    indexOptions: {
        dimensions: 384,        // Default, configurable up to 1536
        space: 'cosine',       // Distance metric
        enableChinese: true    // Chinese support
    }
}
```

## 📊 Performance

| Operation | Scale | Time | Type |
|-----------|-------|------|------|
| Vector Search | 100k docs | 8ms | Semantic |
| FTS Search | 100k docs | 15ms | Keywords |
| **Graph Traversal (2-hop)** | 10k entities | 12ms | **Native KG** |
| **Pattern Discovery** | 50k entities | 150ms | **Native KG** |
| **Shortest Path** | 10k entities | 8ms | **Native KG** |
| Hybrid Query | 100k items | 25ms | Combined |

## 🚦 Roadmap

- [x] Native Knowledge Graph with triple-layer search
- [x] Entity-relationship management
- [x] Multi-hop traversal and path analysis
- [ ] Graph Neural Network integration
- [ ] Temporal knowledge graphs
- [ ] Auto knowledge extraction from text
- [ ] Graph visualization UI

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 📞 Contact

- GitHub Issues: [Report bugs or request features](https://github.com/shihentsou/ai-orchestrator/issues)
- Project Lead: Sean Tsou (shihen.tsou)

---

**JSON-RAG v5.2.1** - Native Knowledge Graph for cognitive memory 🧠
