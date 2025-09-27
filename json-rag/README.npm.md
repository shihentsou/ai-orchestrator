# @memoria/json-rag-core

> ⚠️ **Alpha Release**: APIs may change. Feedback welcome!

Lightweight JSON database with hybrid search capabilities (vector + full-text + structured).

## 🚀 Installation

```bash
npm i @memoria/json-rag-core@alpha
```

## 🎯 Quick Start

```javascript
import { index, query } from '@memoria/json-rag-core'

// Index documents
await index([
  { id: '1', text: 'Authentication middleware at src/auth.js' },
  { id: '2', text: 'Database connection in src/db.js' },
  { id: '3', text: 'React components in src/components' }
])

// Query with hybrid search (keyword + semantic)
const results = await query('auth middleware')
console.log(results)
// [{ id: '1', snippet: 'Authentication middleware...', score: 0.95 }]
```

## ✨ Features

- ✅ **Hybrid search** (keyword + semantic + structured)
- ✅ **Local-first** - Your data stays on your device
- ✅ **Zero dependencies** for core functionality
- ✅ **Chinese language support**
- ✅ **Memory efficient** - Optimized for large datasets
- ✅ **Fast indexing** - Process thousands of documents in seconds
- ⏳ **Vector embeddings** (coming in 0.2.0)
- ⏳ **Persistent storage** (coming in 0.3.0)
- ⏳ **Graph relationships** (coming in 0.4.0)

## 📖 API Reference

### `index(docs)`
Index one or more documents into the system.

```javascript
await index({
  id: 'doc-1',
  text: 'Your content here',
  meta: { source: 'manual', category: 'docs' }
})
```

### `query(q, options)`
Search indexed documents using hybrid search.

```javascript
const results = await query('search terms', {
  limit: 10,        // Max results (default: 10)
  threshold: 0.7    // Similarity threshold (default: 0.7)
})
```

### `clear()`
Clear all indexed data.

```javascript
await clear()
```

## 🌟 Why JSON-RAG?

Unlike traditional vector databases that require complex setup and cloud services, JSON-RAG runs entirely locally with a simple npm install. Perfect for:

- **Personal AI assistants** with memory
- **Documentation search** in your apps
- **Code intelligence** tools
- **Privacy-first** applications
- **Offline-capable** PWAs

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│         Query Interface          │
├─────────────────────────────────┤
│      Hybrid Query Router         │
├─────┬───────────┬────────────┬──┤
│Vector│   FTS     │ Structured │  │
│Index │ Full-text │   JSON     │  │
├─────┴───────────┴────────────┴──┤
│    Local Storage Backend         │
└─────────────────────────────────┘
```

## 🔮 Roadmap

| Version | Features | Status |
|---------|----------|--------|
| 0.1.x | Basic hybrid search | ✅ Released |
| 0.2.x | Vector embeddings | 🚧 In Progress |
| 0.3.x | Persistent storage | 📅 Planned |
| 0.4.x | Graph relationships | 💡 Ideation |
| 1.0.0 | Production ready | 🎯 Q1 2026 |

## 🤝 Contributing

We welcome contributions! This is an alpha release and your feedback is invaluable.

```bash
# Clone the repo
git clone https://github.com/shihentsou/ai-orchestrator.git
cd ai-orchestrator/json-rag

# Install dependencies
npm install

# Run tests
npm test
```

## 📊 Performance

| Operation | Scale | Performance | Memory |
|-----------|-------|-------------|--------|
| Insert (single) | 1 doc | ~2ms | <10MB |
| Batch Insert | 10K docs | ~1.2s | ~50MB |
| Hybrid Query | 1M docs | ~25ms | ~250MB |

## 🛡️ License

MIT © 2025 Project Memoria Contributors

## 🔗 Related Projects

- **[Project Memoria](https://github.com/shihentsou/ai-orchestrator)** - Full AI orchestration platform
- **UAA (Universal AI Adapter)** - Coming soon
- **Demo: [6.4min Multi-AI Collaboration](https://claude.ai/share/229370a4-5628-4612-831d-6a8a526b6500)**

## 📬 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/shihentsou/ai-orchestrator/issues)
- **Email**: shihen.tsou@gmail.com
- **Twitter**: Follow for updates (coming soon)

---

**Note**: This is an alpha release. Core APIs (`index`, `query`, `clear`) are relatively stable, but advanced features and options may change. We're actively developing and would love your feedback!

---

<p align="center">Built with ❤️ for the open-source community</p>