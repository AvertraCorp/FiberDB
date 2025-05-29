export interface StorageConfig {
  engine: 'file' | 'custom';
  dataPath: string;
  walEnabled: boolean;
  cacheSize: number;
  compactionThreshold: number;
  indexingEnabled: boolean;
  backgroundProcessing: boolean;
  encryption: {
    enabled: boolean;
    defaultKey?: string;
  };
  performance: {
    enableMetrics: boolean;
    queryTimeout: number;
    maxConcurrentQueries: number;
  };
}

export const defaultStorageConfig: StorageConfig = {
  engine: 'custom',
  dataPath: './data',
  walEnabled: true,
  cacheSize: 10000,
  compactionThreshold: 1000,
  indexingEnabled: true,
  backgroundProcessing: true,
  encryption: {
    enabled: false
  },
  performance: {
    enableMetrics: true,
    queryTimeout: 30000, // 30 seconds
    maxConcurrentQueries: 100
  }
};

export function loadStorageConfig(): StorageConfig {
  return {
    engine: (process.env.FIBERDB_ENGINE as 'file' | 'custom') || defaultStorageConfig.engine,
    dataPath: process.env.FIBERDB_DATA_PATH || defaultStorageConfig.dataPath,
    walEnabled: process.env.FIBERDB_WAL_ENABLED === 'true' || defaultStorageConfig.walEnabled,
    cacheSize: parseInt(process.env.FIBERDB_CACHE_SIZE || String(defaultStorageConfig.cacheSize)),
    compactionThreshold: parseInt(process.env.FIBERDB_COMPACTION_THRESHOLD || String(defaultStorageConfig.compactionThreshold)),
    indexingEnabled: process.env.FIBERDB_INDEXING_ENABLED !== 'false',
    backgroundProcessing: process.env.FIBERDB_BACKGROUND_PROCESSING !== 'false',
    encryption: {
      enabled: process.env.FIBERDB_ENCRYPTION_ENABLED === 'true',
      defaultKey: process.env.FIBERDB_DEFAULT_ENCRYPTION_KEY
    },
    performance: {
      enableMetrics: process.env.FIBERDB_ENABLE_METRICS !== 'false',
      queryTimeout: parseInt(process.env.FIBERDB_QUERY_TIMEOUT || String(defaultStorageConfig.performance.queryTimeout)),
      maxConcurrentQueries: parseInt(process.env.FIBERDB_MAX_CONCURRENT_QUERIES || String(defaultStorageConfig.performance.maxConcurrentQueries))
    }
  };
}