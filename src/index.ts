/**
 * FiberDB - Main Entry Point
 */
import startServer from "./api/server";
import { saveAnchor, attachToAnchor } from "./core/storage";
import { query, runStructuredQuery, runStructuredQueryAsync } from "./core/query";
import { createHashIndex, createRangeIndex, createTextIndex, listIndexes } from "./core/indexing";
import { documentCache, queryCache, fileExistsCache, getAllCacheStats } from "./utils/cache";
import { performanceTracker } from "./utils/performance";
import config from "./config";

// Export public API
export {
  // Storage operations
  saveAnchor,
  attachToAnchor,
  
  // Query operations
  query,
  runStructuredQuery,
  runStructuredQueryAsync,
  
  // Indexing operations
  createHashIndex,
  createRangeIndex,
  createTextIndex,
  listIndexes,
  
  // Cache management
  documentCache,
  queryCache,
  fileExistsCache,
  getAllCacheStats,
  
  // Performance utilities
  performanceTracker,
  
  // Configuration
  config
};

// Start server if this is the main module
if (import.meta.main) {
  startServer();
}