# Storage Engine Architecture

FiberDB 2.0 features a completely redesigned storage engine that provides ACID compliance, concurrent access, and enterprise-grade performance while maintaining backward compatibility with the original file-based approach.

## Overview

The enhanced storage engine transforms FiberDB from a simple file-based system into a production-ready database with:

- **ACID Compliance**: Write-Ahead Logging ensures data durability
- **Concurrency Control**: Read/write locks enable safe concurrent access
- **Advanced Indexing**: Multi-type indexes for optimal query performance
- **Background Processing**: Automatic optimization and maintenance

## Architecture Components

### Storage Engine Interface

All storage engines implement the `IStorageEngine` interface:

```typescript
interface IStorageEngine {
  initialize(): Promise<void>;
  
  // Entity operations
  saveEntity(entity: Entity): Promise<void>;
  getEntity(type: string, id: string): Promise<Entity | null>;
  deleteEntity(type: string, id: string): Promise<boolean>;
  
  // Edge operations
  addEdge(fromType: string, fromId: string, edge: Edge): Promise<void>;
  removeEdge(fromType: string, fromId: string, edgeId: string): Promise<boolean>;
  
  // Query operations
  query(params: EnhancedQueryParams): Promise<QueryResult>;
  findPaths(fromId: string, toId: string, maxDepth: number): Promise<Path[]>;
  
  // Utility operations
  getStats(): Promise<StorageStats>;
  close(): Promise<void>;
}
```

### Custom Storage Engine

The `CustomStorageEngine` is the main enhanced storage implementation:

```
CustomStorageEngine
├── WALManager           # Write-Ahead Logging
├── LockManager          # Concurrency control
├── IndexManager         # Multi-type indexing
├── In-Memory Store      # Entity cache
└── Background Processor # Optimization tasks
```

## Write-Ahead Logging (WAL)

### Purpose

WAL ensures ACID compliance by recording all operations before applying them:

1. **Atomicity**: All operations in a transaction succeed or fail together
2. **Consistency**: Data remains in a valid state
3. **Isolation**: Concurrent operations don't interfere
4. **Durability**: Committed data survives system crashes

### WAL Implementation

```typescript
interface LogEntry {
  timestamp: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ADD_EDGE' | 'REMOVE_EDGE';
  entityType: string;
  entityId: string;
  data?: Entity;
  edgeData?: Edge;
  transactionId?: string;
}
```

### WAL Lifecycle

```
1. Operation Request
       ↓
2. Write to WAL
       ↓
3. Apply to Memory
       ↓
4. Update Indexes
       ↓
5. Background Compaction
```

### WAL File Format

```
# wal.log
{"timestamp":1701234567890,"operation":"INSERT","entityType":"customer","entityId":"cust-001","data":{...}}
{"timestamp":1701234567891,"operation":"ADD_EDGE","entityType":"customer","entityId":"cust-001","edgeData":{...}}
{"timestamp":1701234567892,"operation":"UPDATE","entityType":"customer","entityId":"cust-001","data":{...}}
```

### Compaction Process

When the WAL reaches a threshold size:

1. **Create Snapshot**: Serialize current in-memory state
2. **Write Snapshot**: Save snapshot to `.snapshot` file
3. **Clear WAL**: Reset WAL file
4. **Update Metadata**: Record compaction timestamp

```typescript
// Snapshot file format
{
  timestamp: 1701234567890,
  entities: {
    "customer:cust-001": { /* entity data */ },
    "user:user-001": { /* entity data */ }
  },
  metadata: {
    totalEntries: 1500,
    lastCompaction: 1701234567890
  }
}
```

## Concurrency Control

### Lock Manager

The `LockManager` provides read/write locks for safe concurrent access:

```typescript
class LockManager {
  // Read lock: Multiple readers, no writers
  async withReadLock<T>(key: string, operation: () => Promise<T>): Promise<T>
  
  // Write lock: Single writer, no readers
  async withWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T>
  
  // Multiple locks: Deadlock-safe multiple entity locking
  async withMultipleWriteLocks<T>(keys: string[], operation: () => Promise<T>): Promise<T>
}
```

### Lock Granularity

Locks are applied at the entity level:

```typescript
// Entity-level locking
const entityKey = `${entityType}:${entityId}`;
await lockManager.withWriteLock(entityKey, async () => {
  // Exclusive access to this entity
  entity.attributes.value = newValue;
  await saveEntity(entity);
});
```

### Deadlock Prevention

1. **Lock Ordering**: Multiple locks are acquired in sorted order
2. **Timeout Detection**: Operations timeout after 10 seconds
3. **Queue Management**: Lock requests are queued and processed fairly

```typescript
// Deadlock-safe multiple entity operation
await lockManager.withMultipleWriteLocks(
  ['customer:cust-001', 'user:user-001'], 
  async () => {
    // Safe to modify both entities
    await updateCustomer();
    await updateUser();
  }
);
```

## Indexing System

### Index Types

The storage engine supports multiple index types:

#### Hash Index
- **Use Case**: Equality lookups
- **Performance**: O(1) average case
- **Storage**: Key → Set of entity IDs

```typescript
// Hash index for customer.industry
industry_index = {
  "Technology": ["customer:cust-001", "customer:cust-003"],
  "Healthcare": ["customer:cust-002"],
  "Finance": ["customer:cust-004", "customer:cust-005"]
}
```

#### B-Tree Index
- **Use Case**: Range queries (>, <, between)
- **Performance**: O(log n) 
- **Storage**: Sorted key-value pairs

```typescript
// B-tree index for customer.revenue
revenue_index = [
  { value: 100000, entityIds: ["customer:cust-002"] },
  { value: 500000, entityIds: ["customer:cust-001"] },
  { value: 1000000, entityIds: ["customer:cust-003"] },
  { value: 5000000, entityIds: ["customer:cust-004"] }
]
```

#### Text Index
- **Use Case**: Full-text search
- **Performance**: O(k) where k is result size
- **Storage**: Word → Set of entity IDs

```typescript
// Text index for customer.description
description_index = {
  "software": ["customer:cust-001", "customer:cust-003"],
  "development": ["customer:cust-001", "customer:cust-004"],
  "healthcare": ["customer:cust-002"],
  "platform": ["customer:cust-003", "customer:cust-004"]
}
```

### Automatic Index Creation

Indexes are automatically created for:

1. **Entity IDs**: Always indexed
2. **Entity Types**: Always indexed  
3. **Common Fields**: `status`, `category`, `created`, `updated`
4. **Edge Types**: Relationship types
5. **Edge Targets**: Relationship targets

### Index Selection

The query optimizer automatically selects the best index:

```typescript
// Query: Find technology customers with revenue > 1M
const query = {
  from: 'customer',
  where: {
    attributes: {
      industry: 'Technology',        // Uses hash index
      revenue: { $gte: 1000000 }    // Uses B-tree index
    }
  }
};

// Index manager finds intersection of:
// 1. Hash index results for industry='Technology'
// 2. B-tree index results for revenue >= 1000000
```

### Index Maintenance

Indexes are maintained automatically:

1. **On Insert**: Add entity to relevant indexes
2. **On Update**: Update affected indexes
3. **On Delete**: Remove entity from all indexes
4. **Background**: Optimize index structure

## Memory Management

### In-Memory Entity Store

The storage engine maintains entities in memory for fast access:

```typescript
private entities = new Map<string, Entity>();
```

### Cache Hierarchy

```
Query Cache
    ↓
Entity Cache (In-Memory Store)
    ↓
Index Cache
    ↓
File System / WAL
```

### Memory Optimization

1. **LRU Eviction**: Least recently used entities are evicted
2. **Background Cleanup**: Periodic memory defragmentation
3. **Lazy Loading**: Documents loaded on demand
4. **Reference Counting**: Track entity usage

## Background Processing

### Background Manager

Handles automatic optimization tasks:

```typescript
class BackgroundManager {
  private async runCompaction(): Promise<void>        // WAL compaction
  private async optimizeIndexes(): Promise<void>     // Index optimization
  private async cleanupCaches(): Promise<void>       // Cache cleanup
}
```

### Scheduled Tasks

- **WAL Compaction**: Every 5 minutes
- **Index Optimization**: Every hour  
- **Cache Cleanup**: Every 30 minutes
- **Statistics Update**: Every 10 minutes

### Compaction Strategy

1. **Size-Based**: Compact when WAL exceeds threshold
2. **Time-Based**: Compact after maximum time interval
3. **Memory-Based**: Compact when memory usage is high

## Performance Characteristics

### Latency Targets

| Operation | Target Latency |
|-----------|----------------|
| Single entity read | < 1ms |
| Single entity write | < 5ms |
| Simple query (indexed) | < 10ms |
| Complex query | < 100ms |
| Graph traversal (depth 3) | < 50ms |

### Throughput Targets

| Operation | Target Throughput |
|-----------|------------------|
| Entity reads | > 10,000 ops/sec |
| Entity writes | > 1,000 ops/sec |
| Simple queries | > 500 queries/sec |
| Complex queries | > 100 queries/sec |

### Scalability Limits

| Resource | Limit |
|----------|-------|
| Entities in memory | 1M entities |
| WAL file size | 100MB |
| Index size | 500MB |
| Concurrent operations | 1000 |

## Configuration

### Storage Engine Options

```typescript
interface StorageEngineOptions {
  compactionThreshold?: number;     // WAL compaction threshold
  enableBackgroundProcessing?: boolean;
  cacheSize?: number;              // Entity cache size
}
```

### Environment Variables

```bash
FIBERDB_ENGINE=custom                    # Use enhanced storage
FIBERDB_WAL_ENABLED=true                # Enable WAL
FIBERDB_INDEXING_ENABLED=true           # Enable indexing  
FIBERDB_CACHE_SIZE=10000                # Cache size
FIBERDB_COMPACTION_THRESHOLD=1000       # WAL compaction
FIBERDB_BACKGROUND_PROCESSING=true      # Background tasks
```

## Monitoring and Diagnostics

### Storage Statistics

```typescript
interface StorageStats {
  totalEntities: number;
  totalEdges: number;
  storageSize: number;        // Bytes
  indexSize: number;          // Bytes
  cacheHitRate: number;       // 0.0 - 1.0
  averageQueryTime: number;   // Milliseconds
}
```

### WAL Statistics

```typescript
const walStats = await walManager.getStats();
// {
//   entriesInMemory: 150,
//   lastCompaction: 1701234567890,
//   walSizeBytes: 2048576
// }
```

### Lock Statistics

```typescript
const lockStats = lockManager.getLockStats();
// {
//   activeLocks: 5,
//   activeReadLocks: 3,
//   activeWriteLocks: 2,
//   queuedOperations: 0
// }
```

### Index Statistics

```typescript
const indexStats = indexManager.getIndexStats();
// {
//   "customer.industry": { size: 1000, memoryUsage: 65536, averageQueryTime: 2 },
//   "customer.revenue": { size: 1000, memoryUsage: 131072, averageQueryTime: 5 }
// }
```

## Error Handling and Recovery

### Crash Recovery

1. **WAL Replay**: Replay WAL entries on startup
2. **Snapshot Loading**: Load latest snapshot if available
3. **Index Rebuilding**: Reconstruct indexes from entities
4. **Consistency Check**: Verify data integrity

### Error Categories

#### Storage Errors
- WAL write failures
- Snapshot corruption  
- Disk space exhaustion

#### Concurrency Errors
- Deadlock detection
- Lock timeout
- Resource contention

#### Index Errors
- Index corruption
- Index rebuild failures
- Query optimization errors

### Recovery Procedures

```typescript
// Automatic recovery on initialization
class CustomStorageEngine {
  async initialize(): Promise<void> {
    try {
      // 1. Load snapshot if available
      await this.loadSnapshot();
      
      // 2. Replay WAL entries
      this.entities = await this.walManager.replay();
      
      // 3. Rebuild indexes
      await this.rebuildIndexes();
      
      // 4. Verify consistency
      await this.verifyConsistency();
      
    } catch (error) {
      console.error('Storage engine initialization failed:', error);
      throw new Error(`Recovery failed: ${error}`);
    }
  }
}
```

## Migration and Compatibility

### File Storage Compatibility

The enhanced storage engine can coexist with file storage:

```typescript
// Configuration determines storage engine
const config = loadStorageConfig();
const engine = config.engine === 'custom' 
  ? new CustomStorageEngine(config.dataPath)
  : new FileStorageEngine(config.dataPath);
```

### Migration Process

1. **Data Reading**: Read anchors and attachments from files
2. **Entity Conversion**: Convert to unified entity format  
3. **Relationship Inference**: Discover relationships from data
4. **Storage**: Save to enhanced storage engine

### Backward Compatibility

Legacy APIs continue to work:

```typescript
// Legacy API is translated to enhanced storage
async function saveAnchor(type: string, id: string, data: any): Promise<void> {
  const entity: Entity = {
    id, type,
    attributes: data,
    documents: {},
    edges: [],
    metadata: { /* ... */ }
  };
  
  await customStorageEngine.saveEntity(entity);
}
```

## Future Enhancements

### Planned Features

1. **Distributed Storage**: Multi-node storage clusters
2. **Replication**: Master-slave replication for reliability
3. **Partitioning**: Horizontal data partitioning
4. **Backup/Restore**: Automated backup and point-in-time recovery

### Performance Improvements

1. **Bloom Filters**: Reduce disk I/O for existence checks
2. **Compression**: Compress WAL and snapshot files
3. **Memory Mapping**: Memory-mapped file access
4. **Parallel Processing**: Multi-threaded query execution

The enhanced storage engine provides the foundation for FiberDB's evolution into a production-ready hybrid database while maintaining the simplicity and flexibility that made the original version successful.