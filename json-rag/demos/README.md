# JSON-RAG Demos

This folder contains executable demonstrations of JSON-RAG's capabilities.

## 🚀 Quick Start Guide

### Prerequisites

Before running the demos, ensure you have the following:

1. **Node.js** (v18.0.0 or higher required for ES Modules)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **npm** (comes with Node.js)
   - Verify installation: `npm --version`

3. **Git** (for cloning the repository)
   - Download from: https://git-scm.com/
   - Verify installation: `git --version`

### Installation Steps

#### Step 1: Clone the Repository

```bash
# Clone from GitHub
git clone https://github.com/yourusername/json-rag.git

# Navigate to the project directory
cd json-rag
```

#### Step 2: Install Dependencies

```bash
# Install core dependencies (required)
npm install

# This will install:
# - better-sqlite3 (for database operations)
# - @xenova/transformers (for embeddings, if used)
```

#### Step 3: Optional - Install Vector Search Support

Vector search provides semantic similarity capabilities but requires additional setup:

```bash
# Try to install hnswlib-node
npm install hnswlib-node
```

**⚠️ Windows Users - Special Instructions:**

If you encounter build errors when installing `hnswlib-node`, you need C++ build tools:

**Option A: Visual Studio Build Tools (Recommended)**
1. Download [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. Run the installer
3. Select "Desktop development with C++" workload
4. Install (requires ~2GB disk space)
5. Restart your terminal and retry `npm install hnswlib-node`

**Option B: Windows Build Tools via npm**
```bash
# Run as Administrator
npm install --global windows-build-tools
# Then retry
npm install hnswlib-node
```

**Option C: Skip Vector Search**
- JSON-RAG works perfectly with just full-text search
- Vector search is optional for enhanced semantic capabilities

#### Step 4: Verify Installation

```bash
# Check if everything is installed correctly
node -e "console.log('Node.js is working!')"

# Test JSON-RAG core
node -e "import('./core/json-rag-core.js').then(() => console.log('JSON-RAG core loaded!'))"
```

---

## 📚 Available Demos

### 1. **Hybrid Search Demo** (`hybrid-search-demo.js`)

Tests the core search capabilities of JSON-RAG.

```bash
# Run the hybrid search demo
node demos/hybrid-search-demo.js
```

**What it demonstrates:**
- Vector search functionality (if hnswlib-node installed)
- Full-text search with FTS5
- Core system integration
- Performance validation

### 2. **JSON-RAG Showcase** (`json-rag-showcase.js`)

A comprehensive demonstration of JSON-RAG as a knowledge management system.

```bash
# Run the complete showcase
node demos/json-rag-showcase.js
```

**What it demonstrates:**
- Building a knowledge base with 8 sample documents
- Various search types (keyword, phrase, Chinese)
- Real-world use case simulation
- System capabilities overview

---

## 🎯 Running the Demos

### Basic Execution

From the JSON-RAG root directory:

```bash
# Method 1: Direct execution
node demos/json-rag-showcase.js

# Method 2: Using npm scripts
npm run demo           # Runs hybrid-search-demo
npm run demo:showcase  # Runs json-rag-showcase
```

### Expected Output Structure

```
🚀 JSON-RAG v5.2.1 Complete Feature Showcase
============================================================

📦 Phase 1: System Initialization
------------------------------------------------------------
  ✅ Vector search support detected (or warning if not)
  ✅ JSON-RAG core initialized
  ✅ Full-text search enabled

📚 Phase 2: Building Knowledge Base
------------------------------------------------------------
  📝 Indexing 8 documents...
  ✅ Documents indexed successfully

🔍 Phase 3: Search Demonstrations
------------------------------------------------------------
  Demo 1: Keyword Search
  Demo 2: Phrase Search
  Demo 3: Chinese Search
  Demo 4: Technical Query

⚡ Phase 4: Advanced Features
------------------------------------------------------------
  System Capabilities
  Performance Metrics

✨ Showcase Complete!
```

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. "Cannot find module" Error

```bash
# Ensure you're in the correct directory
pwd  # Should show .../json-rag

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### 2. Database Lock Error

```bash
# Remove existing database files
rm -rf data/*.db data/*.db-*

# Retry the demo
node demos/json-rag-showcase.js
```

#### 3. Vector Search Not Working

This is normal if `hnswlib-node` is not installed:
- The demos will still work with full-text search
- Vector search is optional but recommended
- See installation instructions above for Windows build tools

#### 4. Chinese Search Not Working

```bash
# Verify SQLite3 installation
npm ls better-sqlite3

# Reinstall if needed
npm uninstall better-sqlite3
npm install better-sqlite3
```

#### 5. Permission Errors

```bash
# On Unix/Mac, make scripts executable
chmod +x demos/*.js

# On Windows, run as Administrator if needed
```

---

## 📂 File Structure

```
json-rag/
├── demos/
│   ├── hybrid-search-demo.js    # Core functionality test
│   ├── json-rag-showcase.js     # Complete feature demo
│   └── README.md                 # This file
├── core/
│   └── json-rag-core.js         # Main library
├── data/                         # Created on first run
│   ├── *.db                     # SQLite databases
│   └── *.hnsw                   # Vector index files
└── package.json                  # Project configuration
```

---

## 💡 Tips for Best Results

1. **First Run**: The first execution may be slower due to initialization
2. **Memory Usage**: Vector search with large datasets requires adequate RAM (4GB+ recommended)
3. **Disk Space**: Ensure at least 100MB free space for demo databases
4. **Clean State**: Delete the `data/` folder to reset demos to initial state

---

## 🚀 Next Steps

After running the demos successfully:

1. **Explore the API**: Check `../docs/api.md` for detailed documentation
2. **Build Your Application**: Use JSON-RAG in your own projects
3. **Customize**: Modify the demos to test your specific use cases
4. **Contribute**: Share your improvements or report issues on GitHub

---

## 📖 Additional Resources

- **Main Documentation**: [README.md](../README.md)
- **API Reference**: [docs/api.md](../docs/api.md) 
- **Architecture Guide**: [docs/architecture.md](../docs/architecture.md)
- **GitHub Issues**: Report problems or request features

---

## 🤝 Getting Help

If you encounter issues not covered here:

1. Check the main README for more information
2. Search existing GitHub issues
3. Create a new issue with:
   - Your operating system and Node.js version
   - Complete error message
   - Steps to reproduce the problem

---

**Happy exploring with JSON-RAG! 🎉**
