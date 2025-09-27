/**
 * @memoria/json-rag-core
 * JSON Source-of-Truth with hybrid retrieval
 * Alpha Release - APIs may change
 */

import JsonRAGCore from './core/json-rag-core.js';
import QueryEngine from './core/query-engine.js';
import VectorManager from './core/vector-manager.js';

// TypeScript type definitions
export const Doc = {
  id: String,
  text: String,
  meta: Object
};

export const QueryOptions = {
  limit: Number,
  threshold: Number,
  weights: Object
};

export const SearchResult = {
  id: String,
  snippet: String,
  score: Number,
  meta: Object
};

// Initialize singleton instance
let instance = null;

/**
 * Initialize JSON-RAG system
 * @private
 */
function initialize() {
  if (!instance) {
    instance = new JsonRAGCore({
      memory: true,
      verbose: false
    });
  }
  return instance;
}

/**
 * Index documents into the system
 * @param {Array<Doc>} docs - Documents to index
 * @returns {Promise<void>}
 */
export async function index(docs) {
  const rag = initialize();
  
  if (!Array.isArray(docs)) {
    docs = [docs];
  }
  
  for (const doc of docs) {
    await rag.addDocument({
      id: doc.id || Date.now().toString(),
      content: doc.text || doc.content,
      metadata: doc.meta || doc.metadata || {}
    });
  }
}

/**
 * Query the system
 * @param {string} q - Query string
 * @param {QueryOptions} options - Query options
 * @returns {Promise<Array<SearchResult>>}
 */
export async function query(q, options = {}) {
  const rag = initialize();
  
  const results = await rag.search({
    query: q,
    limit: options.limit || 10,
    threshold: options.threshold || 0.7,
    hybrid: true
  });
  
  return results.map(r => ({
    id: r.id,
    snippet: r.content ? r.content.substring(0, 200) + '...' : '',
    score: r.score || r.similarity || 0,
    meta: r.metadata || {}
  }));
}

/**
 * Clear all data
 * @returns {Promise<void>}
 */
export async function clear() {
  const rag = initialize();
  await rag.clear();
  instance = null;
}

// Default export for ES6 modules
export default {
  index,
  query,
  clear
};

// Note: Full implementation and advanced features available at:
// https://github.com/shihentsou/ai-orchestrator