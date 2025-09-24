# AI Orchestrator  
> **Multi-AI collaboration layer + long-term memory for large-scale coding**

---

## 🚀 TL;DR
- **AI Orchestrator (UAA)**: Enables GPT-5 / Claude / Gemini / Local LLM to collaborate and peer review, and directly operate the development environment.
- **JSON-RAG**: Provides long-term memory (JSON Source-of-Truth + Vector/FTS indexing), breaking through conversation length limitations.
- Combined → Enables AI to **continuously complete large-scale projects** (generate → review → correct → final delivery).

---

## ❓ Why
- Single models are limited by **context window**, large projects inevitably get interrupted.
- Lack of **cross-model peer review and task delegation**, quality is unstable.
- No **long-term retrievable project memory**, AI loses memory upon restart.

---

## 💡 What
**AI Orchestrator (UAA)**:
- Collaboration modes: sequential / parallel / iterative / review
- Intelligent routing: Automatically assigns tasks to the most suitable model
- Tool integration: Can read/write files, run tests, deploy (through MCP functionality)

**JSON-RAG**:
- JSON **Source of Truth** + Vector/FTS **Hybrid Search**
- Cross-conversation long-term memory, traceable, reduced token costs

---

## 🧪 Demo

### Multi-AI Code Collaboration (Fibonacci example)
Claude Sonnet generates → GPT-5 reviews → Sonnet corrects → Opus 4.1 final polish (production-grade code completed in 6.4 minutes)

🔗 **Live Demo:** [Claude Collaboration Example (Fibonacci, 6.4 mins)](https://claude.ai/share/229370a4-5628-4612-831d-6a8a526b6500)

---

## ⚡ Quickstart
At this stage, the system is still under active development.  
For now, please refer to the demo and documentation:

- 🔗 [Fibonacci Multi-AI Collaboration Demo](https://claude.ai/share/229370a4-5628-4612-831d-6a8a526b6500)  
- 📚 [Documentation Hub (docs/README.md)](./docs/README.md)

> Full open-source code and runnable demos will be released in upcoming iterations.

---

## 📂 Repository Layout

```
/docs
README.md # Documentation hub and navigation
Project-Memoria-Overview.md # Main pitch overview
UAA-Market-Analysis.md
UAA-Implementation-Guide.md
JSON-RAG-Market-Positioning.md
JSON-RAG-Integration-Guide.md
AI_Orchestration-demo.pdf # Demo PDF (case study)
/demos
(reserved for runnable code examples, e.g., collab-fibonacci, JSON-RAG showcase)
/README.md # Main project entry
/LICENSE # MIT license```

---

## 🛣 Roadmap
- [ ] Orchestrator: Visualized collaboration chains (low-code)
- [ ] JSON-RAG: More retrieval strategies & distributed synchronization
- [ ] Cost router: Automatic optimization combining quality/latency/cost
- [ ] Templates: Legal/R&D/Education domain collaboration templates

---

## 📜 License
MIT License © 2025 [Your Name]

---

## 📬 Contact
- Email: shihen.tsou@gmail.com
- Project Docs: https://github.com/shihentsou/ai-orchestrator/tree/main/docs

---