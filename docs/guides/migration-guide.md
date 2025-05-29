# Migration Guide: From File Storage to Enhanced Engine

This guide walks you through migrating from FiberDB's original file-based storage to the new enhanced storage engine with ACID compliance, graph relationships, and improved performance.

## Overview

FiberDB 2.0 maintains 100% backward compatibility while adding powerful new features. You can migrate your data to benefit from:

- **ACID Compliance**: Write-Ahead Logging ensures data durability
- **Graph Relationships**: Model complex entity relationships
- **Better Performance**: Advanced indexing and concurrent operations
- **Production Features**: Monitoring, configuration, and Docker support

## Pre-Migration Checklist

### 1. Backup Your Data

**Always create a backup before migration:**

```bash
# Create a backup of your current data
cp -r ./data ./data_backup_$(date +%Y%m%d_%H%M%S)

# Or use tar for compression
tar -czf data_backup_$(date +%Y%m%d_%H%M%S).tar.gz ./data
```

### 2. Verify Current Installation

```bash
# Check your current FiberDB version
bun run server --version

# Verify data structure
ls -la ./data/
# Should show: anchors/ and attached/ directories
```

### 3. Install Dependencies

Ensure you have the latest version:

```bash
# Update dependencies
bun install

# Verify migration tools are available
bun run migrate:help
```

## Migration Process

### Step 1: Run the Migration

The migration utility automatically converts your file-based data to the enhanced storage format:

```bash
# Basic migration with default paths
bun run migrate

# Custom paths
bun run migrate --old-path ./data --new-path ./data_v2

# Skip backup creation (not recommended)
bun run migrate --no-backup
```

#### Migration Output

```
🚀 Starting FiberDB migration...

Source: ./data
Target: ./data_v2
Backup: Yes

Creating backup...
✅ Backup created: ./data_backup_20241201_143022

Starting migration...
Found 150 anchors and 47 attachment groups
Created 150 entities
✅ Migration completed in 2847ms

=== Migration Results ===
Duration: 2847ms
Anchors processed: 150
Attachment groups processed: 47
Entities created: 150
Errors: 0

Validating migration...
✅ Migration validation passed
Entities: 150
Edges: 23
Document types: contracts, addresses, communications, service-requests
```

### Step 2: Validate Migration

Always validate the migration before switching:

```bash
# Validate the migrated data
bun run migrate:validate --new-path ./data_v2
```

**Validation checks:**
- ✅ All entities are accessible
- ✅ Data integrity is maintained
- ✅ Relationships are properly inferred
- ✅ Document types are preserved

### Step 3: Update Configuration

Update your environment to use the enhanced storage engine:

```bash
# Set environment variables
export FIBERDB_ENGINE=custom
export FIBERDB_DATA_PATH=./data_v2
export FIBERDB_WAL_ENABLED=true
export FIBERDB_INDEXING_ENABLED=true
```

Or create a `.env` file:

```env
FIBERDB_ENGINE=custom
FIBERDB_DATA_PATH=./data_v2
FIBERDB_WAL_ENABLED=true
FIBERDB_INDEXING_ENABLED=true
FIBERDB_CACHE_SIZE=10000
FIBERDB_COMPACTION_THRESHOLD=1000
```

### Step 4: Test Your Application

```bash
# Start the server with enhanced engine
bun run server

# Run your existing tests
bun run test

# Run enhanced performance tests
bun run test:enhanced
```

### Step 5: Switch to New Data Path

Once validation passes:

```bash
# Stop your application
# Update configuration permanently
# Restart with new data path

# Optional: Remove old data after verification
# rm -rf ./data
```

## Migration Features

### Automatic Relationship Inference

The migration tool automatically discovers relationships from your data:

#### Common Relationship Patterns

```typescript
// These field patterns are automatically converted to relationships:
{
  parentId: "parent-123",     // → PARENT relationship
  ownerId: "owner-456",       // → OWNED_BY relationship
  managerId: "mgr-789",       // → MANAGED_BY relationship
  relatedIds: ["rel-1", "rel-2"]  // → RELATED relationships
}
```

#### Example Migration Result

**Before (File Storage):**
```json
// anchors/customer/cust-001.json
{
  "name": "Acme Corporation",
  "managerId": "user-001"
}

// attached/cust-001/contracts.json
[{
  "id": "contract-001",
  "value": 100000,
  "status": "active"
}]
```

**After (Enhanced Storage):**
```typescript
// Unified entity with inferred relationship
{
  id: "cust-001",
  type: "customer",
  attributes: {
    name: "Acme Corporation"
    // managerId removed (now a relationship)
  },
  documents: {
    contracts: [{
      id: "contract-001",
      value: 100000,
      status: "active"
    }]
  },
  edges: [{
    id: "cust-001_MANAGED_BY_user-001",
    type: "MANAGED_BY",
    target: "user:user-001",
    properties: {
      inferred: true,
      sourceField: "managerId"
    }
  }]
}
```

### Schema Preservation

All your existing data structure is preserved:

- **Anchor data** → `entity.attributes`
- **Attachments** → `entity.documents`
- **Field names** → Unchanged
- **Data types** → Preserved
- **Encryption** → Maintained

## Backward Compatibility

Your existing code continues to work unchanged:

### Legacy API Still Works

```typescript
import { saveAnchor, attachToAnchor, query } from 'fiberdb';

// This code continues to work exactly as before
await saveAnchor('customer', 'cust-001', {
  name: 'Acme Corporation',
  industry: 'Technology'
});

await attachToAnchor('cust-001', 'contracts', {
  id: 'contract-001',
  value: 100000
});

const results = await query({
  primary: 'customer',
  filter: { industry: 'Technology' }
});
```

### Enhanced Features Available

While maintaining compatibility, you can now use enhanced features:

```typescript
import { FiberDB } from 'fiberdb';

const db = new FiberDB();
await db.initialize();

// New graph capabilities
await db.addRelationship('customer', 'cust-001', 'user', 'user-001', 'EMPLOYS');
const paths = await db.findPath('customer:cust-001', 'product:prod-001');

// Enhanced querying
const results = await db.enhancedQuery({
  from: 'customer',
  where: {
    attributes: { industry: 'Technology' },
    edges: { type: 'EMPLOYS' }
  }
});
```

## Performance Improvements

After migration, you'll see significant performance improvements:

### Before Migration (File Storage)
- ❌ No ACID compliance
- ❌ Limited concurrency
- ❌ Basic caching
- ❌ No graph relationships

### After Migration (Enhanced Storage)
- ✅ ACID compliance with WAL
- ✅ Concurrent read/write operations
- ✅ Advanced multi-level caching
- ✅ Graph relationships and traversal
- ✅ Automatic indexing
- ✅ Background optimization

### Benchmark Comparison

```bash
# Test performance before and after
bun run benchmark         # Legacy storage
bun run benchmark:enhanced # Enhanced storage

# Typical improvements:
# - Insert speed: 3-5x faster
# - Query speed: 2-4x faster
# - Concurrent operations: 10x improvement
# - Graph queries: New capability
```

## Troubleshooting

### Common Issues

#### 1. Migration Fails with "Permission Denied"

```bash
# Ensure write permissions
chmod -R 755 ./data
mkdir -p ./data_v2
```

#### 2. "Old data directory does not exist"

```bash
# Verify the correct path
ls -la ./data
# Update the migration command with correct path
bun run migrate --old-path /correct/path/to/data
```

#### 3. Validation Fails

```bash
# Check migration logs for errors
bun run migrate 2>&1 | tee migration.log

# Validate specific issues
bun run migrate:validate --new-path ./data_v2
```

#### 4. Application Won't Start

```bash
# Verify environment variables
echo $FIBERDB_ENGINE
echo $FIBERDB_DATA_PATH

# Test with explicit configuration
FIBERDB_ENGINE=custom FIBERDB_DATA_PATH=./data_v2 bun run server
```

### Recovery Procedures

#### Rollback to File Storage

If issues occur, you can rollback:

```bash
# Stop the application
# Restore environment variables
export FIBERDB_ENGINE=file
export FIBERDB_DATA_PATH=./data

# Restart application
bun run server
```

#### Restore from Backup

```bash
# Remove problematic migrated data
rm -rf ./data_v2

# Restore from backup
cp -r ./data_backup_20241201_143022 ./data

# Retry migration with fixes
bun run migrate
```

## Docker Migration

### Update Docker Configuration

**Before (docker-compose.yml):**
```yaml
services:
  fiberdb:
    build: .
    volumes:
      - ./data:/app/data
```

**After (docker-compose.enhanced.yml):**
```yaml
services:
  fiberdb:
    build:
      dockerfile: Dockerfile.enhanced
    environment:
      FIBERDB_ENGINE: custom
      FIBERDB_WAL_ENABLED: "true"
    volumes:
      - fiberdb_data:/app/data
```

### Docker Migration Process

```bash
# 1. Stop existing container
docker-compose down

# 2. Migrate data locally
bun run migrate --old-path ./data --new-path ./data_v2

# 3. Copy migrated data to docker volume
docker run --rm -v $(pwd)/data_v2:/source -v fiberdb_data:/dest alpine sh -c "cp -r /source/* /dest/"

# 4. Start with enhanced configuration
docker-compose -f docker-compose.enhanced.yml up -d
```

## Post-Migration Optimization

### 1. Configure Enhanced Features

```bash
# Optimize for your workload
export FIBERDB_CACHE_SIZE=20000
export FIBERDB_COMPACTION_THRESHOLD=2000
export FIBERDB_MAX_CONCURRENT_QUERIES=200
```

### 2. Enable Monitoring

```typescript
// Monitor performance after migration
const stats = await db.getStats();
console.log({
  totalEntities: stats.totalEntities,
  cacheHitRate: stats.cacheHitRate,
  averageQueryTime: stats.averageQueryTime
});
```

### 3. Test New Features

```typescript
// Try graph capabilities
const network = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: { direction: 'BOTH', maxDepth: 3 },
  returnType: 'NODES'
});

// Test concurrent operations
const results = await Promise.all([
  db.enhancedQuery({ from: 'customer' }),
  db.enhancedQuery({ from: 'user' }),
  db.enhancedQuery({ from: 'product' })
]);
```

## Next Steps

After successful migration:

1. **Explore Enhanced API**: Read the [Enhanced API Guide](../api/enhanced-api.md)
2. **Optimize Performance**: Follow the [Performance Guide](performance-optimization.md)
3. **Configure Production**: Set up [Docker Deployment](docker-deployment.md)
4. **Learn Graph Features**: Study [Graph Queries](../query-system/graph-queries.md)

## Support

If you encounter issues during migration:

1. **Check logs**: Review migration output for specific errors
2. **Validate data**: Run validation tools to identify problems
3. **Consult documentation**: Review relevant guides
4. **Seek help**: Open an issue with migration logs and system details

The migration process is designed to be safe and reversible. Take your time, validate thoroughly, and don't hesitate to rollback if issues arise.