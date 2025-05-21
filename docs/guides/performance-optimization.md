# Performance Optimization in FiberDB

This guide explains the performance optimization features in FiberDB and how to use them effectively to improve query speed and reduce resource usage.

## Table of Contents

1. [Performance Features Overview](#performance-features-overview)
2. [Caching System](#caching-system)
3. [Parallel Processing](#parallel-processing)
4. [Indexing System](#indexing-system)
5. [Query Optimization](#query-optimization)
6. [Performance Measurement](#performance-measurement)
7. [Optimization Strategies](#optimization-strategies)
8. [Advanced Performance Tuning](#advanced-performance-tuning)

## Performance Features Overview

FiberDB includes several built-in performance optimization features:

1. **Multi-Level Caching**: Reduces disk I/O and processing overhead
2. **Parallel Processing**: Accelerates queries on large datasets
3. **Indexing System**: Speeds up filtering operations
4. **Query Optimization**: Automatically selects efficient execution paths
5. **Performance Metrics**: Provides detailed timing for query operations

Each of these features can be controlled through query parameters or configuration settings.

## Caching System

FiberDB implements a multi-level caching system to minimize expensive operations:

### Cache Types

1. **Document Cache**: Stores frequently accessed JSON documents
   - Reduces disk I/O and JSON parsing
   - Configured with `documentCacheSize` setting

2. **Query Result Cache**: Stores complete results of recent queries
   - Eliminates duplicate processing for identical queries
   - Configured with `queryCacheSize` setting

3. **File Existence Cache**: Caches results of file existence checks
   - Reduces filesystem operations
   - Configured with `fileCheckCacheSize` setting

### Using the Cache

Caching is enabled by default. To control caching for specific queries:

```javascript
// Use caching (default behavior)
const result = await query({
  primary: "business-partner",
  id: "BP12345678"
});

// Skip cache for fresh results
const freshResult = await query({
  primary: "business-partner",
  id: "BP12345678",
  skipCache: true
});
```

In the HTTP API, you can control caching with the `X-Skip-Cache` header:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -H "X-Skip-Cache: true" \
  -d '{ "primary": "business-partner", "id": "BP12345678" }'
```

### Cache Statistics

You can view cache statistics using the API:

```bash
curl -X GET http://localhost:4000/cache
```

This returns information about cache size, hit rates, and efficiency:

```json
{
  "documentCache": {
    "size": 128,
    "maxSize": 1000,
    "hitRate": 0.87,
    "hits": 876,
    "misses": 131
  },
  "queryCache": { ... },
  "fileExistsCache": { ... }
}
```

### Clearing Caches

To clear all caches:

```bash
curl -X DELETE http://localhost:4000/cache
```

## Parallel Processing

For large datasets, FiberDB can process files in parallel:

### How Parallel Processing Works

1. File operations are executed concurrently using Promise.all
2. Documents are processed in batches (typically 50 at a time)
3. Attachments for multiple anchors are loaded simultaneously
4. Processing is distributed across the event loop

### Enabling Parallel Processing

```javascript
// Enable parallel processing
const result = await query({
  primary: "business-partner",
  useParallel: true
});
```

In the HTTP API:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -H "X-Use-Parallel: true" \
  -d '{ "primary": "business-partner" }'
```

### When to Use Parallel Processing

- **Small Datasets (1-10 entities)**: Synchronous processing is usually faster
- **Medium Datasets (10-100 entities)**: Marginal benefits from parallel processing
- **Large Datasets (100+ entities)**: Significant benefits from parallel processing

Performance improvements:
- Small datasets: 0-20% improvement (or sometimes slower)
- Medium datasets: 25-50% improvement
- Large datasets: 50-80% improvement

## Indexing System

FiberDB includes an indexing system to accelerate filter operations:

### Index Types

1. **Hash Indexes**: Fast lookups for equality filters (exact matches)
2. **Range Indexes**: Efficient for numeric and date comparisons
3. **Text Indexes**: Optimize text search operations

### Using Indexes

Indexing is enabled by default. To control index usage:

```javascript
// Use indexes (default behavior)
const result = await query({
  primary: "business-partner",
  filter: { status: "active" }
});

// Skip indexes and use full scan
const noIndexResult = await query({
  primary: "business-partner",
  filter: { status: "active" },
  useIndexes: false
});
```

### Auto-Indexed Fields

Common filter fields are automatically indexed:
- ID fields
- Status fields
- Type/classification fields
- Date fields (creation, modification)

### Index Performance Impact

Indexing significantly improves performance for filtered queries:
- Equality filters: Up to 95% faster with indexes
- Range filters: Up to 75% faster with indexes
- Combined filters: Varies based on selectivity

## Query Optimization

FiberDB automatically optimizes query execution:

### Optimization Strategies

1. **ID Optimization**: Direct file access for ID-based queries
2. **Small Result Optimization**: Special path for queries expected to return few results
3. **Cache Utilization**: Prioritizes cache hits when possible
4. **Execution Model Selection**: Chooses between sync/async based on expected workload
5. **Filter Ordering**: Applies most selective filters first

### Query Planning

The query planner determines the most efficient execution path:

1. ID-based queries → Direct document access
2. Indexed filters → Index lookup + filtered access
3. Non-indexed filters → Full collection scan with filters
4. Attachment filters → Load attachments after filtering anchors

## Performance Measurement

FiberDB provides detailed performance metrics for query optimization:

### Enabling Performance Metrics

```javascript
// Include performance metrics in result
const result = await query({
  primary: "business-partner",
  filter: { status: "active" },
  includePerformanceMetrics: true
});

// Access metrics
console.log(result[0].__metrics);
```

In the HTTP API:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -H "X-Include-Performance-Metrics: true" \
  -d '{ "primary": "business-partner" }'
```

### Metric Types

The metrics object includes:

```json
{
  "total": 42.5,          // Total query time (ms)
  "fileRead": 35.2,       // Time spent reading files
  "filtering": 5.1,       // Time spent applying filters
  "attachment": 2.2,      // Time spent processing attachments
  "cacheHit": true,       // Whether query used cached results
  "cacheType": "document", // Type of cache hit
  "indexUsed": true,      // Whether indexes were used
  "indexFields": ["status"], // Fields that used indexes
  "batchCount": 2,        // Number of batches processed
  "documentCount": 87     // Total documents processed
}
```

## Optimization Strategies

Follow these strategies to optimize FiberDB performance:

### Data Organization

1. **Right-Size Anchor Documents**: Keep anchor documents focused and minimal
2. **Logical Attachment Grouping**: Group related data into cohesive attachments
3. **Limit Attachment Size**: Keep individual attachments under 1MB when possible
4. **Split Large Collections**: Break huge collections into logical partitions

### Query Patterns

1. **Use ID Queries When Possible**: ID-based queries are the fastest
2. **Filter at the Anchor Level First**: Apply filters to anchor documents before attachments
3. **Be Specific with Field Selection**: Only include fields you need
4. **Limit Attachment Loading**: Only request attachments you need
5. **Use Index-Backed Fields for Filtering**: Prefer filtering on indexed fields

### Effective Caching

1. **Reuse Query Patterns**: Identical queries benefit from result caching
2. **Warm the Cache**: Run common queries during startup
3. **Size Caches Appropriately**: Configure cache sizes based on your dataset
4. **Clear Cache When Needed**: Clear caches after bulk data changes

## Advanced Performance Tuning

For advanced performance tuning:

### Configuration Optimization

Adjust the configuration in `config.ts` for your workload:

```typescript
export default {
  // ... other settings
  
  cache: {
    documentCacheSize: 5000,     // Increase for read-heavy workloads
    queryCacheSize: 500,         // Increase for repetitive query patterns
    fileCheckCacheSize: 10000,   // Increase for large numbers of files
    ttlShort: 60000,             // 1 minute
    ttlMedium: 300000,           // 5 minutes
    ttlLong: 900000,             // 15 minutes
  },
  
  performance: {
    defaultParallel: true,       // Enable parallel processing by default
    batchSize: 100,              // Adjust batch size based on document size
  }
};
```

### Optimizing Large Datasets

For very large datasets:

1. **Implement Data Sharding**: Divide data across logical boundaries
2. **Use Selective Loading**: Only load necessary attachments
3. **Implement TTL Policies**: Archive old data that's rarely accessed
4. **Use Parallel Processing**: Always enable parallel for large datasets
5. **Consider Denormalization**: Duplicate key data to avoid joins

### Benchmarking Your Workload

Use the built-in benchmarking tools:

```bash
# Run all benchmarks
bun run benchmark

# Specific benchmarks
bun run benchmark:cache
bun run benchmark:parallel
bun run benchmark:indexing
```

Create custom benchmarks for your specific workload:

```typescript
// custom-benchmark.ts
import { performance } from 'perf_hooks';
import { query } from './src/core/query';

async function runBenchmark() {
  console.log('Running custom benchmark...');
  
  // Warm up
  await query({ primary: "business-partner" });
  
  // Test your specific query pattern
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    await query({
      primary: "business-partner",
      filter: { status: "active" },
      include: ["firstName", "lastName", "addresses"]
    });
  }
  const duration = performance.now() - start;
  
  console.log(`Executed 100 queries in ${duration}ms (${duration/100}ms per query)`);
}

runBenchmark();
```

### Performance Monitoring

For production environments, implement monitoring:

1. **Track Query Timing**: Log slow queries for optimization
2. **Monitor Cache Hit Rates**: Ensure caches are effective
3. **Watch Disk I/O**: Monitor filesystem activity
4. **Track Memory Usage**: Ensure cache sizes are appropriate
5. **Implement Circuit Breakers**: Prevent overload from complex queries