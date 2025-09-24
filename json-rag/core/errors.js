// core/errors.js
// 自定義錯誤類型定義
// v5.2.1 - 2025-09-17

/**
 * 基礎錯誤類
 */
export class JSONRAGError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 向量維度不匹配錯誤
 */
export class DimensionMismatchError extends JSONRAGError {
  constructor(expected, actual) {
    super(`Dimension mismatch: expected ${expected}, got ${actual}`, 'DIMENSION_MISMATCH');
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * 索引未初始化錯誤
 */
export class IndexNotInitializedError extends JSONRAGError {
  constructor() {
    super('Index not initialized. Call initialize() first', 'INDEX_NOT_INITIALIZED');
  }
}

/**
 * 嵌入器未初始化錯誤
 */
export class EmbedderNotInitializedError extends JSONRAGError {
  constructor() {
    super('Embedder not initialized. Call initialize() first', 'EMBEDDER_NOT_INITIALIZED');
  }
}

/**
 * 文檔未找到錯誤
 */
export class DocumentNotFoundError extends JSONRAGError {
  constructor(docId) {
    super(`Document not found: ${docId}`, 'DOCUMENT_NOT_FOUND');
    this.docId = docId;
  }
}

/**
 * 無效配置錯誤
 */
export class InvalidConfigError extends JSONRAGError {
  constructor(message) {
    super(`Invalid configuration: ${message}`, 'INVALID_CONFIG');
  }
}

/**
 * 儲存錯誤
 */
export class StorageError extends JSONRAGError {
  constructor(message) {
    super(`Storage error: ${message}`, 'STORAGE_ERROR');
  }
}

/**
 * 索引錯誤
 */
export class IndexError extends JSONRAGError {
  constructor(message) {
    super(`Index error: ${message}`, 'INDEX_ERROR');
  }
}

/**
 * 並發錯誤
 */
export class ConcurrencyError extends JSONRAGError {
  constructor(message) {
    super(`Concurrency error: ${message}`, 'CONCURRENCY_ERROR');
  }
}
