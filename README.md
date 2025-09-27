# Project Memoria: AI Orchestrator
> **Open-source AI collaboration infrastructure — Making AIs work together better**

[![npm version](https://img.shields.io/npm/v/@shihen.tsou/json-rag-core/alpha)](https://www.npmjs.com/package/@shihen.tsou/json-rag-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/shihentsou/ai-orchestrator?style=social)](https://github.com/shihentsou/ai-orchestrator)

---

## 🌟 Our Open Core Strategy

We believe AI collaboration infrastructure should be **transparent**, **secure**, and **community-driven**. The core of Project Memoria—our JSON-RAG engine and Universal AI Adapter—is and always will be **open-source** (MIT License).

Our business model is built on providing **value-added services** and **enterprise-grade features** on top of this trusted open core:
- **Cloud Sync**: End-to-end encrypted synchronization
- **Enterprise Dashboard**: Team management and analytics
- **Priority Support**: SLA-backed professional services
- **Certified Marketplace**: Curated workflows and connectors

---

## 🚀 TL;DR

**The Problem**: Single AI models are limited by context windows, lack peer review, and lose memory between sessions.

**Our Solution**: 
- **Universal AI Adapter (UAA)**: Orchestrates GPT-5, Claude, Gemini, and local LLMs to collaborate like a team
- **JSON-RAG**: Provides persistent, searchable memory across conversations
- **Result**: Production-grade code in 6.4 minutes (vs hours manually)

---

## 📦 Quick Start

### Install JSON-RAG (Available Now!)

```bash
npm install @shihen.tsou/json-rag-core@alpha
```

```javascript
import { index, query } from '@shihen.tsou/json-rag-core';

// Add to memory
await index([
  { id: '1', text: 'Authentication logic in auth.js' },
  { id: '2', text: 'Database models in models/' }
]);

// Search with hybrid query
const results = await query('authentication');
```

---

## 🧪 Proven Results

### 6.4 Minute AI Collaboration Demo
Watch three AI models work together to produce production-ready code:

1. **Claude Sonnet**: Initial implementation
2. **GPT-5**: Code review and critique
3. **Claude Opus 4.1**: Final polish and documentation

**Metrics**:
- Code Quality: 5/10 → 10/10
- Critical Errors: 7 → 0
- Time: 6.4 minutes

🔗 **[Live Demo](https://claude.ai/share/229370a4-5628-4612-831d-6a8a526b6500)** | 📄 **[Case Study PDF](./doc/AI_Orchestration-demo.pdf)**

---

## 💡 Core Components

### Universal AI Adapter (UAA)
*Status: Beta (Coming Soon)*

Orchestration modes:
- **Sequential**: Chain of thought processing
- **Parallel**: Simultaneous analysis
- **Iterative**: Refinement loops
- **Review**: Peer validation

### JSON-RAG Memory Layer
*Status: Alpha (Available Now)*

Features:
- **Hybrid Search**: Vector + Full-text + Structured
- **Local-first**: Your data stays on your device
- **Cross-platform**: Windows, macOS, Linux, Mobile
- **Language Support**: English, Chinese, more coming

---

## 📊 Why Open Source?

We follow the successful path of **GitLab**, **Supabase**, and **Docker**:

| Aspect | Traditional Approach | Our Approach |
|--------|---------------------|--------------|
| **Trust** | "Trust us, it's secure" | "Verify it yourself" |
| **Innovation** | Internal R&D only | Global contributor network |
| **Adoption** | Sales-driven | Developer-driven |
| **Ecosystem** | Closed integrations | Open marketplace |

---

## 🛣️ Roadmap

### Q4 2025
- [x] JSON-RAG Alpha Release on npm
- [x] Open source core components
- [ ] UAA Beta Release
- [ ] First 100 contributors

### Q1 2026
- [ ] JSON-RAG 1.0 (Production Ready)
- [ ] UAA Cloud Service Launch
- [ ] Enterprise Features
- [ ] 10,000+ npm weekly downloads

### Q2 2026
- [ ] Workflow Marketplace
- [ ] Certified Partner Program
- [ ] Global Hackathon

---

## 🤝 Community

### Contributing
We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Get Involved
- **Discord**: [Join our community](https://discord.gg/project-memoria) *(coming soon)*
- **Twitter**: [@ProjectMemoria](https://twitter.com/ProjectMemoria) *(coming soon)*
- **Blog**: [dev.to/projectmemoria](https://dev.to/projectmemoria) *(coming soon)*

### Support
- **GitHub Issues**: [Bug reports & features](https://github.com/shihentsou/ai-orchestrator/issues)
- **Email**: shihen.tsou@gmail.com
- **Enterprise**: Contact for custom solutions

---

## 📈 Metrics & Milestones

| Metric | Current | Target (2026) |
|--------|---------|---------------|
| GitHub Stars | 🌱 New | 5,000+ |
| npm Downloads | ✅ Published! | 50,000/month |
| Contributors | 1 | 100+ |
| Enterprise Customers | 0 | 50+ |

---

## 🏢 Commercial Services

While our core is open source, we offer premium services for teams and enterprises:

### SaaS Platform (Coming 2026)
- One-click deployment
- Automatic scaling
- 99.9% uptime SLA
- Starting at $99/month

### Enterprise Edition
- On-premise deployment
- Custom integrations
- Priority support
- Training & consulting

### Marketplace
- Certified workflows
- Industry templates
- Revenue sharing for creators

---

## 📜 License

MIT License © 2025 Project Memoria Contributors

See [LICENSE](./LICENSE) for details.

---

## 🙏 Acknowledgments

Built on the shoulders of giants:
- OpenAI, Anthropic, Google for amazing models
- The open-source community for inspiration
- Early adopters and contributors

---

<p align="center">
  <b>Join us in building the future of AI collaboration</b><br>
  <i>Where AIs work together, amazing things happen</i>
</p>

<p align="center">
  <a href="https://github.com/shihentsou/ai-orchestrator">⭐ Star us on GitHub</a> •
  <a href="https://www.npmjs.com/package/@shihen.tsou/json-rag-core">📦 Try on npm</a> •
  <a href="mailto:shihen.tsou@gmail.com">📧 Get in touch</a>
</p>