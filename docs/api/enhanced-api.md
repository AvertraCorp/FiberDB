# Enhanced API Guide

This guide covers the new enhanced API features introduced in FiberDB 2.0, including the unified entity model, graph relationships, and advanced querying capabilities.

## Overview

The Enhanced API provides powerful new capabilities while maintaining full backward compatibility with the legacy anchor/attachment API. You can use both APIs in the same application as needed.

## Key Concepts

### Unified Entity Model

FiberDB 2.0 introduces a unified entity model that combines three types of data:

- **Attributes**: Structured key-value data (replaces anchor data)
- **Documents**: Collections of unstructured documents (replaces attachments)
- **Edges**: First-class relationships between entities

```typescript
interface Entity {
  id: string;
  type: string;
  attributes: Record<string, any>;    // Structured data
  documents: Record<string, any[]>;   // Document collections
  edges: Edge[];                      // Relationships
  metadata: EntityMetadata;           // System metadata
}
```

### Graph Relationships

Relationships are modeled as typed edges with optional properties:

```typescript
interface Edge {
  id: string;
  type: string;        // Relationship type (e.g., "EMPLOYS", "OWNS")
  target: string;      // Target entity ID
  properties?: any;    // Additional relationship data
  weight?: number;     // Relationship strength
  temporal?: {         // Time-based relationships
    validFrom: Date;
    validTo?: Date;
  };
}
```

## FiberDB Class

The main entry point for the enhanced API is the `FiberDB` class:

```typescript
import { FiberDB } from 'fiberdb';

const db = new FiberDB('./data');
await db.initialize();
```

### Configuration Options

```typescript
const db = new FiberDB('./data', {
  compactionThreshold: 1000,
  enableBackgroundProcessing: true,
  cacheSize: 10000
});
```

## Entity Operations

### Creating Entities

```typescript
const customer: Entity = {
  id: 'cust-001',
  type: 'customer',
  attributes: {
    name: 'Acme Corporation',
    industry: 'Technology',
    founded: new Date('2010-01-01'),
    revenue: 5000000,
    active: true
  },
  documents: {
    contracts: [
      {
        id: 'contract-001',
        value: 100000,
        startDate: '2024-01-01',
        status: 'active'
      }
    ],
    communications: [
      {
        date: new Date(),
        type: 'email',
        subject: 'Welcome to FiberDB',
        content: 'Thank you for your business'
      }
    ]
  },
  edges: [], // Relationships added separately
  metadata: {
    created: new Date(),
    updated: new Date(),
    version: 1,
    schemaVersion: 1,
    tags: ['enterprise', 'technology']
  }
};

await db.saveEntity(customer);
```

### Retrieving Entities

```typescript
// Get a specific entity
const customer = await db.getEntity('customer', 'cust-001');

if (customer) {
  console.log(customer.attributes.name);
  console.log(customer.documents.contracts);
}
```

### Updating Entities

```typescript
// Modify and save
const customer = await db.getEntity('customer', 'cust-001');
if (customer) {
  customer.attributes.revenue = 6000000;
  customer.metadata.updated = new Date();
  customer.metadata.version++;
  
  await db.saveEntity(customer);
}
```

### Deleting Entities

```typescript
const deleted = await db.deleteEntity('customer', 'cust-001');
console.log(`Entity deleted: ${deleted}`);
```

## Relationship Management

### Adding Relationships

```typescript
// Create a relationship between entities
await db.addRelationship(
  'customer', 'cust-001',    // From entity
  'user', 'user-001',       // To entity
  'EMPLOYS',                // Relationship type
  {                         // Relationship properties
    startDate: '2023-01-01',
    department: 'Engineering',
    role: 'Senior Developer'
  }
);
```

### Removing Relationships

```typescript
const removed = await db.removeRelationship(
  'customer', 'cust-001',
  'EMPLOYS',
  'user-001'
);
```

### Bidirectional Relationships

```typescript
// Create relationships in both directions
await db.addRelationship('user', 'user-001', 'customer', 'cust-001', 'WORKS_FOR', {
  startDate: '2023-01-01',
  department: 'Engineering'
});

await db.addRelationship('customer', 'cust-001', 'user', 'user-001', 'EMPLOYS', {
  startDate: '2023-01-01',
  department: 'Engineering'
});
```

## Enhanced Querying

### Basic Queries

```typescript
// Query all entities of a type
const customers = await db.enhancedQuery({
  from: 'customer'
});

// Query with filters
const techCustomers = await db.enhancedQuery({
  from: 'customer',
  where: {
    attributes: {
      industry: 'Technology',
      active: true
    }
  }
});
```

### Complex Filters

```typescript
// Range queries
const largeCorporations = await db.enhancedQuery({
  from: 'customer',
  where: {
    attributes: {
      revenue: { $gte: 1000000 },
      employeeCount: { $lt: 10000 }
    }
  }
});

// Array membership
const specificIndustries = await db.enhancedQuery({
  from: 'customer',
  where: {
    attributes: {
      industry: { $in: ['Technology', 'Healthcare', 'Finance'] }
    }
  }
});

// Document filters
const activeContracts = await db.enhancedQuery({
  from: 'customer',
  where: {
    documents: {
      contracts: { $exists: true }
    },
    attributes: {
      status: 'active'
    }
  }
});
```

### Field Selection

```typescript
// Select specific fields
const customerNames = await db.enhancedQuery({
  from: 'customer',
  include: ['attributes.name', 'attributes.industry'],
  where: {
    attributes: { active: true }
  }
});

// Exclude fields
const publicCustomerData = await db.enhancedQuery({
  from: 'customer',
  exclude: ['documents.internal_notes', 'metadata'],
  where: {
    attributes: { public: true }
  }
});
```

### Pagination

```typescript
// Paginated results
const page1 = await db.enhancedQuery({
  from: 'customer',
  limit: 10,
  offset: 0
});

const page2 = await db.enhancedQuery({
  from: 'customer',
  limit: 10,
  offset: 10
});

console.log(`Total customers: ${page1.metadata.total}`);
```

## Graph Queries

### Graph Traversal

```typescript
// Find all entities connected to a customer
const customerNetwork = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'BOTH',      // 'OUT', 'IN', or 'BOTH'
    maxDepth: 3,
    edgeTypes: ['EMPLOYS', 'OWNS', 'USES']
  },
  returnType: 'NODES'
});

console.log(`Found ${customerNetwork.nodes?.length} connected entities`);
```

### Path Finding

```typescript
// Find paths between entities
const paths = await db.findPath('customer:cust-001', 'product:prod-001', 4);

if (paths.length > 0) {
  console.log('Shortest path:');
  paths[0].nodes.forEach((node, index) => {
    console.log(`${index + 1}. ${node}`);
  });
}
```

### Advanced Graph Queries

```typescript
// Find all employees of a company and their associated products
const employeeProducts = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'IN',
    edgeTypes: ['WORKS_FOR'],
    maxDepth: 1,
    nodeFilter: { type: 'user' },
    edgeFilter: { 
      properties: { 
        department: 'Engineering' 
      } 
    }
  },
  returnType: 'NODES'
});
```

## Performance Features

### Caching Control

```typescript
// Force fresh data (skip cache)
const freshData = await db.enhancedQuery({
  from: 'customer',
  useCache: false
});

// Enable parallel processing
const fastQuery = await db.enhancedQuery({
  from: 'customer',
  useParallel: true,
  where: {
    attributes: { active: true }
  }
});
```

### Performance Metrics

```typescript
// Include performance metrics
const result = await db.enhancedQuery({
  from: 'customer',
  includeMetrics: true
});

console.log(`Query executed in ${result.metadata.executionTime}ms`);
```

### Batch Operations

```typescript
// Concurrent entity creation
const entities = Array.from({ length: 100 }, (_, i) => createEntity(i));
await Promise.all(entities.map(entity => db.saveEntity(entity)));

// Concurrent queries
const [customers, users, products] = await Promise.all([
  db.enhancedQuery({ from: 'customer' }),
  db.enhancedQuery({ from: 'user' }),
  db.enhancedQuery({ from: 'product' })
]);
```

## Encryption and Security

### Field-Level Encryption

```typescript
// Encryption is handled at the entity level
const sensitiveEntity: Entity = {
  id: 'user-001',
  type: 'user',
  attributes: {
    name: 'John Doe',
    email: 'john@example.com',
    ssn: '123-45-6789'  // Will be encrypted
  },
  // ... other fields
};

// Encryption options passed to legacy saveAnchor method
await db.saveAnchor('user', 'user-001', sensitiveEntity.attributes, {
  secureFields: ['ssn'],
  key: 'encryption-key'
});
```

## Statistics and Monitoring

### Storage Statistics

```typescript
const stats = await db.getStats();

console.log({
  totalEntities: stats.totalEntities,
  totalEdges: stats.totalEdges,
  storageSize: stats.storageSize,
  indexSize: stats.indexSize,
  cacheHitRate: stats.cacheHitRate,
  averageQueryTime: stats.averageQueryTime
});
```

## Error Handling

### Common Error Patterns

```typescript
try {
  const entity = await db.getEntity('customer', 'nonexistent');
  if (!entity) {
    console.log('Entity not found');
  }
} catch (error) {
  console.error('Database error:', error);
}

try {
  await db.addRelationship('customer', 'cust-1', 'user', 'nonexistent', 'EMPLOYS');
} catch (error) {
  if (error.message.includes('not found')) {
    console.error('Target entity does not exist');
  }
}
```

## Best Practices

### Entity Design

1. **Use meaningful entity types**: `customer`, `user`, `product` vs `entity1`, `data`
2. **Structure attributes logically**: Group related fields, use consistent naming
3. **Organize documents by purpose**: `contracts`, `communications`, `logs`
4. **Design relationships semantically**: `EMPLOYS`, `OWNS`, `USES` vs `RELATED`

### Performance Optimization

1. **Use field selection**: Only retrieve data you need
2. **Leverage indexes**: Structure queries to use available indexes
3. **Batch operations**: Group multiple operations when possible
4. **Monitor performance**: Use metrics to identify bottlenecks

### Relationship Modeling

1. **Choose relationship directions carefully**: Consider query patterns
2. **Use meaningful relationship types**: Make relationships self-documenting
3. **Include relevant properties**: Store context with relationships
4. **Consider bidirectional relationships**: When entities reference each other

## Migration from Legacy API

The enhanced API can be used alongside the legacy API:

```typescript
// Legacy API still works
await saveAnchor('customer', 'cust-001', { name: 'Acme' });
await attachToAnchor('cust-001', 'contracts', { value: 100000 });

// Enhanced API adds new capabilities
await db.addRelationship('customer', 'cust-001', 'user', 'user-001', 'EMPLOYS');
const network = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: { direction: 'BOTH', maxDepth: 2 },
  returnType: 'NODES'
});
```

## Next Steps

- **Explore Examples**: Check out `examples/enhanced-api-demo.ts`
- **Performance Testing**: Run `bun run benchmark:enhanced`
- **Architecture Deep Dive**: Read the [Architecture Documentation](../architecture/README.md)
- **Query Optimization**: See the [Performance Guide](../guides/performance-optimization.md)