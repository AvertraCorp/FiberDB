/**
 * FiberDB - Main Entry Point
 */
import startServer from "./api/server";

// Legacy API imports (maintained for backward compatibility)
import { saveAnchor, attachToAnchor } from "./core/storage";
import { query, runStructuredQuery, runStructuredQueryAsync } from "./core/query";
import { createHashIndex, createRangeIndex, createTextIndex, listIndexes } from "./core/indexing";
import { documentCache, queryCache, fileExistsCache, getAllCacheStats } from "./utils/cache";
import { performanceTracker } from "./utils/performance";
import config from "./config";

// Enhanced API imports
import {
  FiberDB,
  defaultFiberDB,
  saveEntity,
  getEntity,
  addRelationship,
  enhancedQuery,
  queryGraph
} from "./api/fiberdb";

// Dual-Storage Enhanced API imports
import {
  EnhancedFiberDB,
  defaultEnhancedFiberDB,
  enableColumnarStorage,
  configureColumnarStorage,
  checkConsistency,
  getColumnarMetrics
} from "./api/enhanced-fiberdb";

// Enhanced types
export * from "./types/enhanced/entity";
export * from "./types/enhanced/query";
export * from "./types/enhanced/columnar";

// Storage configuration
export { loadStorageConfig } from "./config/storage-config";

// Migration utilities
export { DataMigrator, runMigration } from "./migration/migrator";

// Storage engines
export { CustomStorageEngine } from "./core/storage/engines/custom-storage-engine";
export { DualStorageEngine } from "./core/storage/engines/dual-storage-engine";
export { WALManager } from "./core/storage/wal/wal-manager";
export { LockManager } from "./core/storage/concurrency/lock-manager";

// Columnar storage components
export { ColumnStore } from "./core/storage/columnar/column-store";
export { SmartQueryRouter } from "./core/query/smart-router";
export { QueryAnalyzer } from "./core/query/analyzer";

// Export public API
export {
  // ===== LEGACY API (BACKWARD COMPATIBLE) =====
  
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
  config,
  
  // ===== ENHANCED API (NEW CAPABILITIES) =====
  
  // Enhanced FiberDB class
  FiberDB,
  defaultFiberDB,
  
  // Entity operations
  saveEntity,
  getEntity,
  
  // Relationship operations
  addRelationship,
  
  // Enhanced querying
  enhancedQuery,
  queryGraph,
  
  // ===== DUAL-STORAGE API (SMART COLUMNAR STORAGE) =====
  
  // Enhanced FiberDB with dual-storage
  EnhancedFiberDB,
  defaultEnhancedFiberDB,
  
  // Columnar storage configuration
  enableColumnarStorage,
  configureColumnarStorage,
  
  // Monitoring and maintenance
  checkConsistency,
  getColumnarMetrics
};

// Start server if this is the main module
if (import.meta.main) {
  startServer();
}