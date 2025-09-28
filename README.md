# AI Orchestrator: Multi-Model Collaboration + Persistent Memory
> **Open-source infrastructure for orchestrating multiple AIs with JSON-KG memory system**

[![npm version](https://img.shields.io/npm/v/@shihen.tsou/json-rag-core/alpha)](https://www.npmjs.com/package/@shihen.tsou/json-rag-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/shihentsou/ai-orchestrator?style=social)](https://github.com/shihentsou/ai-orchestrator)

---

## 🌟 What We Built

Two complementary systems that transform how AIs work:

**1. Universal AI Adapter (UAA)** - Multi-model collaboration orchestrator
**2. JSON-KG (JSON-RAG)** - Knowledge graph-native memory system

Together, they enable AIs to collaborate, remember, and deliver production-grade results.

---

## 🚀 Proven Result: 6.4 Minutes to Production Code

![AI Collaboration Demo](./docs/Ai-Collaboration-02.pdf)

Three AI models collaborating through UAA:
1. **Claude Sonnet 4.0**: Initial code generation (41s)
2. **GPT-5**: Code review with 7 critical issues found (189s)  
3. **Claude Sonnet 4.0**: Revision based on feedback (39s)
4. **Claude Opus 4.1**: Final polish and documentation (117s)

**Result**: Production-ready Fibonacci generator with complete JSDoc, error handling, and optimizations.

🔗 **[Live Demo](https://claude.ai/share/229370a4-5628-4612-831d-6a8a526b6500)**

---

## 🧠 Universal AI Adapter (UAA)

### What It Does
Transforms multiple LLMs into a coordinated team with **role assignments**, **quality gates**, and **cost controls**.

### Collaboration Process
```
Context Building → Role Assignment → Execution → Arbitration → Provenance Check
```

### Key Components

#### Roles & Policies
```javascript
const roles = {
  producer:  { model: "claude-sonnet",   budget: {tokens: 8000, ms: 1500} },
  critic:    { model: "gpt-5",           checks: ["logic", "facts"] },
  verifier:  { model: "local-llm",       checks: ["numbers", "citations"] },
  refiner:   { model: "claude-opus-4.1",  style: "production" }
};
```

#### Collaboration Modes
- **Sequential**: `producer → critic → refiner` (quality gates)
- **Parallel**: Multiple producers → arbiter selects best
- **Iterative**: `producer ↔ critic` until convergence
- **Review Board**: N producers → M critics → final decision

#### Example: Legal Citation Check
```javascript
const result = await uaa.execute({
  task: "legal.citation_check",
  context: await jsonKG.query({
    q: "precedent cases",
    graph: { edgeTypes: ["cites"], hops: 2 }
  }),
  roles: {
    producer: { model: "claude-sonnet", budget: {tokens: 8000} },
    critic:   { model: "gpt-5", checks: ["logic", "citations"] },
    refiner:  { model: "claude-opus-4.1" }
  },
  provenance: { require: true, minCitations: 3 }
});
```

---

## 🗄️ JSON-KG: Knowledge Graph Memory

### What It Does
A graph-native retrieval system that unifies **nodes**, **edges**, **vectors**, and **full-text search** for true 3D memory.

### Core Schema
```javascript
// Node (Entity)
{
  "_id": "person:alice",
  "type": "researcher",
  "text": "Dr. Alice studies LLMs",
  "embed": [...],  // 384-dim vector
  "attrs": { "specialization": "alignment" }
}

// Edge (Relationship)
{
  "from": "person:alice",
  "to": "paper:safety",
  "type": "authored",
  "weight": 0.9,
  "attrs": { "year": 2024 }
}
```

### Graph-Constrained Query
```javascript
const answer = await jsonKG.query({
  q: "Who studies AI safety?",
  filter: { nodeType: "researcher" },         // Structural
  vector: { topK: 100 },                      // Semantic
  graph: { edgeTypes: ["studies"], hops: 2 }, // Relationships
  rerank: { mix: {cosine: 0.6, bm25: 0.4} }   // Final ranking
});
// Returns subgraph with full provenance
```

### Available Now on npm
```bash
npm install @shihen.tsou/json-rag-core@alpha
```

---

## 🏗️ Architecture

```
Application Layer
       ↓
┌─────────────────────────────────────┐
│    Universal AI Adapter (UAA)       │
│  • Role assignment & orchestration  │
│  • Quality gates & arbitration      │
│  • Cost/latency optimization        │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│      JSON-KG Memory System          │
│  • Knowledge graph (nodes + edges)  │
│  • Vector search (embeddings)       │
│  • Full-text search (FTS5)          │
└─────────────────────────────────────┘
```

---

## 📊 Technical Comparison

### UAA vs Simple API Aggregation
| Feature | UAA | API Aggregators |
|---------|-----|-----------------|
| Multi-model collaboration | ✅ Role-based workflow | ❌ Simple routing |
| Quality control | ✅ Peer review & gates | ❌ Single output |
| Context optimization | ✅ Graph-constrained | ⚠️ Full context |
| Provenance tracking | ✅ Every decision | ❌ |

### JSON-KG vs Traditional RAG
| Feature | JSON-KG | Vector-only RAG |
|---------|---------|-----------------|
| Query capability | 3D (graph+vector+text) | 1D (similarity) |
| Relationship queries | ✅ N-hop traversal | ❌ |
| Context reduction | 3-10× smaller | Baseline |
| Provenance | ✅ Node/edge level | ⚠️ Chunk level |

---

## 🛠️ Installation & Usage

### JSON-KG (Available Now)
```bash
# Install
npm install @shihen.tsou/json-rag-core@alpha

# Basic usage
import { index, query } from '@shihen.tsou/json-rag-core';

// Add knowledge
await index([
  { id: '1', text: 'Authentication in auth.js', type: 'code' }
]);

// Query with graph constraints
const results = await query('authentication', {
  graph: { nodeTypes: ['code'], hops: 1 }
});
```

### UAA (Coming Soon)
Full orchestration system will be released after JSON-KG stabilizes.

---

## 🔬 Real-World Applications

### Clinical Trials
- **Challenge**: Track drug→adverse_event→population with provenance
- **Solution**: Graph traversal with citation to source documents
- **Result**: FDA-compliant safety reports

### Legal Analysis
- **Challenge**: Find precedent chains and reasoning paths
- **Solution**: `case→cites→case` traversal with paragraph-level tracking
- **Result**: Complete citation networks

### Financial Compliance
- **Challenge**: Map company→supplier→risk cascades
- **Solution**: Multi-hop relationship analysis with temporal constraints
- **Result**: Risk propagation visualization

---

## 🚦 Roadmap

### Current Status
- [x] JSON-KG core released on npm
- [x] 6.4-minute collaboration demo
- [x] Windows/Mac/Linux support

### Next Steps
- [ ] UAA beta release
- [ ] Performance benchmarks
- [ ] Integration examples

### Future Vision
- [ ] Distributed graph processing
- [ ] Real-time collaboration
- [ ] Visual workflow editor

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Get Support
- **GitHub Issues**: [Report bugs & request features](https://github.com/shihentsou/ai-orchestrator/issues)
- **Email**: shihen.tsou@gmail.com

---

## 📜 License

MIT License © 2025 Sean Tsou

See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <b>Making AIs work together to solve complex problems</b><br>
  <i>Open-source infrastructure for the age of AI collaboration</i>
</p>

<p align="center">
  <a href="https://github.com/shihentsou/ai-orchestrator">⭐ Star on GitHub</a> •
  <a href="https://www.npmjs.com/package/@shihen.tsou/json-rag-core">📦 Try on npm</a>
</p>
