# FiberDB Documentation

Welcome to the FiberDB documentation. This comprehensive set of documents will help you understand, use, and optimize FiberDB 3.0 - featuring **Smart Dual-Storage** for unprecedented analytical performance.

## 🚀 What's New in FiberDB 3.0

FiberDB now features **Smart Dual-Storage** - an intelligent hybrid architecture that automatically routes queries to optimal storage systems for 10-100x performance improvements on analytical workloads.

### 🧠 Smart Dual-Storage Features
- **Automatic Query Routing**: System intelligently selects entity or columnar storage
- **10-100x Performance**: Analytical queries dramatically faster with columnar storage
- **Zero API Changes**: Existing code works unchanged with automatic optimization
- **Selective Configuration**: Enable columnar storage only where beneficial
- **Runtime Management**: Add/remove columns without downtime

### Key Enhancements from v2.0
- **ACID Compliance**: Write-Ahead Logging ensures data durability
- **Graph Relationships**: First-class support for complex entity relationships
- **Enhanced Performance**: Advanced indexing and concurrent processing
- **Production Ready**: Enterprise-grade features and Docker deployment

## Documentation Structure

### **Smart Dual-Storage (NEW)**
- **[Dual-Storage Architecture](architecture/storage-engine.md)**: Smart dual-storage system design  
- **[Query Routing Guide](query-system/README.md)**: Automatic query optimization
- **[Enhanced API Reference](api/enhanced-api.md)**: Complete dual-storage API
- **[Performance Optimization](guides/performance-optimization.md)**: Columnar storage tuning

### **Getting Started**
- **[Quick Start Guide](guides/getting-started.md)**: Installation and basic usage
- **[Migration Guide](guides/migration-guide.md)**: Upgrading to dual-storage
- **[Docker Deployment](guides/docker-deployment.md)**: Containerized deployment

### **API Documentation** 
- **[API Overview](api/README.md)**: Legacy, enhanced, and dual-storage APIs
- **[Endpoint Reference](api/endpoints.md)**: Complete HTTP API documentation
- **[Enhanced API Guide](api/enhanced-api.md)**: Graph, entity, and columnar features

### **Architecture**
- **[Architecture Overview](architecture/README.md)**: Complete system design
- **[Storage Engine](architecture/storage-engine.md)**: Dual-storage architecture with WAL
- **[Concurrency Model](architecture/concurrency.md)**: Lock management and ACID compliance

### **Query System**
- **[Query System Overview](query-system/README.md)**: Smart routing and optimization
- **[Graph Queries](query-system/graph-queries.md)**: Relationship traversal and path finding
- **[Advanced Filtering](query-system/advanced-filters.md)**: Complex query patterns

### **Performance & Optimization**
- **[Performance Guide](guides/performance-optimization.md)**: Dual-storage optimization
- **[Indexing Strategy](guides/indexing-strategy.md)**: Entity and columnar indexes
- **[Benchmarking](guides/benchmarking.md)**: Performance testing with dual-storage

## Quick Navigation

### **For New Users**
1. [Getting Started Guide](guides/getting-started.md) - Basic installation and usage
2. [Data Modeling Guide](guides/data-modeling.md) - Structuring your data
3. [API Overview](api/README.md) - Making your first queries

### **For Existing Users**
1. [Migration Guide](guides/migration-guide.md) - Upgrading to FiberDB 2.0
2. [Enhanced API Guide](api/enhanced-api.md) - New features and capabilities
3. [Backward Compatibility](guides/backward-compatibility.md) - Ensuring smooth transition

### **For System Administrators**
1. [Docker Deployment](guides/docker-deployment.md) - Production deployment
2. [Configuration Reference](guides/configuration.md) - Environment and settings
3. [Monitoring & Metrics](guides/monitoring.md) - Performance tracking

### **For Developers**
1. [Architecture Overview](architecture/README.md) - Understanding the system
2. [Contributing Guide](../CONTRIBUTING.md) - Development guidelines
3. [Testing Strategy](guides/testing.md) - Test suite and benchmarks

## API Quick Reference

### **Legacy API (Backward Compatible)**
```typescript
import { saveAnchor, attachToAnchor, query } from 'fiberdb';

// Your existing code continues to work unchanged
await saveAnchor('customer', 'cust-001', { name: 'Acme Corp' });
await attachToAnchor('cust-001', 'contracts', { value: 100000 });
const results = await query({ primary: 'customer' });
```

### **Smart Dual-Storage API (Latest)**
```typescript
import { EnhancedFiberDB } from 'fiberdb';

const db = new EnhancedFiberDB();

// Configure columnar storage for analytics
await db.enableColumnarStorage('business-partner', {
  columns: ['revenue', 'region'],
  indexes: ['region'], 
  compression: true,
  autoSync: true
});

// Queries automatically use optimal storage
const analytics = await db.query({
  primary: 'business-partner',
  aggregate: { revenue: 'SUM' },
  groupBy: ['region']
}); // 100x faster automatically!
```

### **Enhanced API (Graph & Relationships)**
```typescript
import { FiberDB, Entity } from 'fiberdb';

const db = new FiberDB();
await db.addRelationship('customer', 'cust-1', 'user', 'user-1', 'EMPLOYS');
const paths = await db.findPath('customer:cust-1', 'product:prod-1');
```

## Feature Comparison

| Feature | Legacy API | Enhanced API | Smart Dual-Storage |
|---------|------------|--------------|-------------------|
| Data Storage | Anchors + Attachments | Unified Entities | Entity + Columnar |
| Relationships | Manual references | Typed edges | Typed edges |
| Query Types | Filters only | Filters + Graph | Auto-routed optimization |
| Analytics Performance | Standard | Standard | **10-100x faster** |
| ACID Compliance | File-based | WAL + Locking | WAL + Locking |
| Indexing | Basic | Multi-type indexes | Entity + Columnar indexes |
| Concurrency | Limited | Full concurrency | Full concurrency |
| Memory Usage | Standard | Standard | **90% reduction** (analytics) |
| API Changes | N/A | Compatible | **Zero changes** |

## Deployment Options

### **Development**
```bash
# Local development with enhanced engine
FIBERDB_ENGINE=custom bun run server
```

### **Production**
```bash
# Docker deployment with full feature set
docker-compose -f docker-compose.enhanced.yml up -d
```

### **Migration**
```bash
# Migrate existing data to enhanced storage
bun run migrate --old-path ./data --new-path ./data_v2
```

## Support and Community

- **Issues**: Report bugs and feature requests on GitHub
- **Documentation**: This comprehensive documentation set
- **Examples**: See `examples/` directory for practical usage
- **Performance**: Run `bun run benchmark:enhanced` for performance testing

## Contributing to Documentation

We welcome contributions to improve this documentation:

1. **Found an error?** Open an issue or submit a PR
2. **Missing information?** Help us expand the docs
3. **Better examples?** Share your use cases

### Documentation Structure
```
docs/
├── api/                 # API documentation
├── architecture/        # System architecture
├── guides/             # User guides and tutorials
└── query-system/       # Query capabilities
```

## Next Steps

- **New to FiberDB?** Start with the [Getting Started Guide](guides/getting-started.md)  
- **Want 100x faster analytics?** Learn about [Smart Dual-Storage](architecture/storage-engine.md)
- **Existing user?** Check out the [Migration Guide](guides/migration-guide.md) for dual-storage
- **Ready to deploy?** Follow the [Docker Deployment Guide](guides/docker-deployment.md)
- **Need maximum performance?** Read the [Dual-Storage Optimization Guide](guides/performance-optimization.md)

---

*FiberDB 3.0 Documentation - Now featuring Smart Dual-Storage for 10-100x analytical performance*