/**
 * FiberDB core types
 */

// Query types
export interface QueryOptions {
  primary: string;
  id?: string;
  filter?: Record<string, any>; // primary-level filtering
  where?: Record<string, any>;  // attachment-level filtering
  include?: string[];
  decryptionKey?: string;
  includePerformanceMetrics?: boolean;
  skipCache?: boolean;
  skipTTL?: boolean;  // added to skip TTL filtering
  useIndexes?: boolean;
  useParallel?: boolean;
  // Enhanced query capabilities
  aggregate?: Record<string, 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'>;
  groupBy?: string | string[];
  orderBy?: string | string[] | Array<{ column: string; direction: 'ASC' | 'DESC' }>;
  limit?: number;
  offset?: number;
}

// Enhanced query parameters for dual-storage system
export interface QueryParams {
  primary: string;
  id?: string;
  where?: Record<string, any>;
  include?: string[];
  aggregate?: Record<string, 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'>;
  groupBy?: string | string[];
  orderBy?: string | string[] | Array<{ column: string; direction: 'ASC' | 'DESC' }>;
  limit?: number;
  offset?: number;
}

// Basic entity structure for dual-storage compatibility
export interface Entity {
  id: string;
  type: string;
  attributes: Record<string, any>;
  documents: Record<string, any[]>;
  edges: any[];
  metadata: {
    created: Date;
    updated: Date;
    version: number;
    schemaVersion: number;
  };
}

// Query result structure
export interface QueryResult {
  entities: Entity[];
  metadata?: {
    total: number;
    executionTime: number;
    cached: boolean;
  };
}

// Storage options
export interface StorageOptions {
  secureFields?: string[];
  key?: string;
  includePerformanceMetrics?: boolean;
}

// Performance metrics
export type PerformanceMetrics = {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  details?: Record<string, any>;
};

// Cache statistics
export interface CacheStats {
  name: string;
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// Index related types
export enum IndexType {
  HASH = 'hash',
  RANGE = 'range',
  TEXT = 'text',
  ARRAY = 'array'
}

export enum IndexTarget {
  ANCHOR = 'anchor',
  ATTACHED = 'attached'
}

export interface IndexDefinition {
  id: string;
  name: string;
  type: IndexType;
  target: IndexTarget;
  entityType: string;
  attachedType?: string;
  field: string;
  isUnique?: boolean;
  isCaseSensitive?: boolean;
  ignoreNull?: boolean;
  options?: Record<string, any>;
}

export interface IndexEntry {
  value: any;
  entities: string[];
}

export interface IndexSet {
  definition: IndexDefinition;
  entries: IndexEntry[];
  lastUpdated: number;
  stats: {
    totalEntries: number;
    uniqueValues: number;
    sizeBytes: number;
  };
}

export interface IndexQueryResult {
  matchedIds: string[];
  lookupTime: number;
  indexUsed: string;
  indexType: IndexType;
}

export interface IndexStats {
  id: string;
  hits: number;
  totalLookupTime: number;
  avgLookupTime: number;
  lastUsed: number;
}

export interface IndexCondition {
  value: any;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'in';
}

// Export enhanced types for dual-storage system
export * from './enhanced/entity';
export * from './enhanced/query';
export * from './enhanced/columnar';