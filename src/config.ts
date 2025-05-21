/**
 * FiberDB Configuration
 */

export default {
  // Server configuration
  server: {
    port: process.env.PORT || 4001,
    host: process.env.HOST || 'localhost',
  },
  
  // Storage configuration
  storage: {
    baseDir: process.env.STORAGE_DIR || 'data',
    ttlDays: parseInt(process.env.TTL_DAYS || '180', 10),
  },
  
  // Caching configuration
  cache: {
    documentCacheSize: parseInt(process.env.DOCUMENT_CACHE_SIZE || '1000', 10),
    queryCacheSize: parseInt(process.env.QUERY_CACHE_SIZE || '100', 10),
    fileCheckCacheSize: parseInt(process.env.FILE_CHECK_CACHE_SIZE || '5000', 10),
    ttlShort: parseInt(process.env.CACHE_TTL_SHORT || '60000', 10),      // 1 minute
    ttlMedium: parseInt(process.env.CACHE_TTL_MEDIUM || '300000', 10),   // 5 minutes
    ttlLong: parseInt(process.env.CACHE_TTL_LONG || '900000', 10),       // 15 minutes
  },
  
  // Cryptography configuration
  crypto: {
    algorithm: process.env.CRYPTO_ALGORITHM || 'aes-256-cbc',
    // In production, use a secure method to generate and store IV
    iv: Buffer.alloc(16, 0), // Static IV for development; use env var in production
  },
  
  // Indexing configuration
  indexing: {
    enabled: process.env.ENABLE_INDEXING !== 'false',
    autoRebuild: process.env.AUTO_REBUILD_INDEXES !== 'false',
  },
  
  // Performance configuration
  performance: {
    defaultParallel: process.env.DEFAULT_PARALLEL === 'true',
    logMetrics: process.env.LOG_PERFORMANCE_METRICS === 'true',
  }
};