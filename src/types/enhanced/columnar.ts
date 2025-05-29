/**
 * Columnar Storage Configuration Types
 * 
 * Defines the types and interfaces for the smart dual-storage system
 * that combines entity-based storage with optional columnar storage
 * for optimized analytical queries.
 */

export interface ColumnarEntityConfig {
  /** List of columns to store in columnar format (only these columns, not entire entity) */
  columns: string[];
  
  /** List of columns to index for fast filtering and grouping */
  indexes: string[];
  
  /** Enable compression for this entity type's columnar data */
  compression: boolean;
  
  /** Automatically sync changes to columnar store on entity saves */
  autoSync: boolean;
  
  /** Sync mode for columnar updates */
  syncMode: 'immediate' | 'batch' | 'scheduled';
  
  /** Batch size for bulk operations (used when autoSync is false) */
  batchSize?: number;
  
  /** Schedule interval in milliseconds for scheduled sync mode */
  scheduleInterval?: number;
}

export interface ColumnarConfig {
  /** Enable columnar storage globally */
  enabled: boolean;
  
  /** Entity type configurations - only these types get columnar storage */
  entityTypes: Map<string, ColumnarEntityConfig>;
  
  /** Always maintain original entity format (safety guarantee) */
  keepOriginalFormat: true;
  
  /** Enable automatic query routing based on query characteristics */
  autoRouting: boolean;
  
  /** Base path for columnar storage files */
  basePath: string;
  
  /** Global compression settings */
  compression: {
    enabled: boolean;
    algorithm: 'gzip' | 'lz4' | 'snappy';
    level: number;
  };
  
  /** Performance tuning settings */
  performance: {
    maxMemoryUsage: number; // bytes
    cacheSize: number; // number of column chunks to cache
    backgroundSyncEnabled: boolean;
  };
}

export type QueryType = 'TRANSACTIONAL' | 'ANALYTICAL' | 'HYBRID';

export interface QueryAnalysis {
  /** Type of query based on characteristics */
  type: QueryType;
  
  /** Complexity level for performance estimation */
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** What data is needed for the query */
  dataRequirements: 'FULL_RECORDS' | 'COLUMNS_ONLY' | 'MIXED';
  
  /** Estimated selectivity (percentage of data that will match) */
  estimatedSelectivity: number;
  
  /** Columns required for the query */
  requiredColumns: string[];
  
  /** Whether aggregation operations are needed */
  hasAggregation: boolean;
  
  /** Whether grouping operations are needed */
  hasGroupBy: boolean;
  
  /** Whether the query needs complete entity records */
  needsFullRecords: boolean;
}

export interface ExecutionPlan {
  /** Selected execution strategy */
  strategy: 'ENTITY_ONLY' | 'COLUMNAR_ONLY' | 'HYBRID';
  
  /** Reason for strategy selection */
  reason: string;
  
  /** Estimated execution time in milliseconds */
  estimatedTime: number;
  
  /** Estimated memory usage in bytes */
  estimatedMemory: number;
  
  /** Storage systems that will be used */
  storageUsed: ('entity' | 'columnar')[];
  
  /** Steps in the execution plan */
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  /** Step number in execution order */
  order: number;
  
  /** Description of what this step does */
  description: string;
  
  /** Storage system used for this step */
  storage: 'entity' | 'columnar';
  
  /** Estimated time for this step */
  estimatedTime: number;
}

export interface CostAnalysis {
  /** Cost to execute using entity store only */
  entityStoreCost: StorageCost;
  
  /** Cost to execute using columnar store only */
  columnStoreCost: StorageCost;
  
  /** Cost to execute using hybrid approach */
  hybridCost: StorageCost;
  
  /** Recommended approach based on cost analysis */
  recommendation: ExecutionPlan;
}

export interface StorageCost {
  /** Estimated execution time in milliseconds */
  executionTime: number;
  
  /** Estimated memory usage in bytes */
  memoryUsage: number;
  
  /** Estimated I/O operations */
  ioOperations: number;
  
  /** Cost score (lower is better) */
  score: number;
}

export interface ColumnarMetrics {
  /** Query performance metrics */
  queryMetrics: {
    avgQueryTime: number;
    queryThroughput: number;
    cacheHitRate: number;
  };
  
  /** Storage metrics */
  storageMetrics: {
    columnStoreSize: number;
    compressionRatio: number;
    indexEfficiency: number;
  };
  
  /** System health metrics */
  systemMetrics: {
    syncLatency: number;
    errorRate: number;
    backgroundTasksQueue: number;
  };
}

export interface ConsistencyReport {
  /** Entity types that were checked */
  entityTypesChecked: string[];
  
  /** List of found inconsistencies */
  inconsistencies: ConsistencyIssue[];
  
  /** Recommended repair actions */
  repairActions: RepairAction[];
  
  /** Overall consistency status */
  status: 'CONSISTENT' | 'MINOR_ISSUES' | 'MAJOR_ISSUES';
}

export interface ConsistencyIssue {
  /** Type of inconsistency */
  type: 'MISSING_COLUMN_DATA' | 'ORPHANED_COLUMN_DATA' | 'DATA_MISMATCH' | 'INDEX_CORRUPTION';
  
  /** Entity type affected */
  entityType: string;
  
  /** Entity ID affected (if applicable) */
  entityId?: string;
  
  /** Column affected (if applicable) */
  column?: string;
  
  /** Description of the issue */
  description: string;
  
  /** Severity level */
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RepairAction {
  /** Type of repair action */
  type: 'REBUILD_COLUMN' | 'REBUILD_INDEX' | 'SYNC_DATA' | 'REMOVE_ORPHANED';
  
  /** Entity type to repair */
  entityType: string;
  
  /** Column to repair (if applicable) */
  column?: string;
  
  /** Description of what will be done */
  description: string;
  
  /** Estimated time to complete repair */
  estimatedTime: number;
}

/**
 * Column data storage format
 */
export interface ColumnData {
  /** Column name */
  name: string;
  
  /** Data type of the column */
  type: 'string' | 'number' | 'boolean' | 'date' | 'object';
  
  /** Compressed or raw data */
  data: Buffer | any[];
  
  /** Whether the data is compressed */
  compressed: boolean;
  
  /** Compression algorithm used (if compressed) */
  compressionAlgorithm?: string;
  
  /** Index data for fast lookups */
  index?: ColumnIndex;
  
  /** Metadata about the column */
  metadata: {
    entityType: string;
    recordCount: number;
    createdAt: Date;
    updatedAt: Date;
    checksum: string;
  };
}

export interface ColumnIndex {
  /** Index type */
  type: 'btree' | 'hash' | 'bitmap';
  
  /** Index data */
  data: Map<any, number[]> | Buffer;
  
  /** Index metadata */
  metadata: {
    cardinality: number;
    selectivity: number;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Query result with optional execution metadata
 */
export interface EnhancedQueryResult<T = any> {
  /** Query results */
  data: T[];
  
  /** Optional execution metadata */
  metadata?: {
    executionPlan: ExecutionPlan;
    actualExecutionTime: number;
    storageUsed: ('entity' | 'columnar')[];
    cacheHits: number;
    totalRecordsScanned: number;
    explanation: string;
  };
}