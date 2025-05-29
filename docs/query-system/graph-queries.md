# Graph Queries Guide

FiberDB 2.0 introduces powerful graph database capabilities, allowing you to model and query complex relationships between entities. This guide covers everything from basic relationship modeling to advanced graph traversal queries.

## Overview

Graph features in FiberDB enable you to:
- Model complex relationships between entities
- Traverse connections to discover related data
- Find paths between distant entities
- Analyze network structures and patterns

## Graph Concepts

### Entities as Nodes

Every entity in FiberDB can participate in graph relationships:

```typescript
const customer: Entity = {
  id: 'cust-001',
  type: 'customer',
  attributes: { name: 'Acme Corporation' },
  documents: { /* ... */ },
  edges: [], // Relationships
  metadata: { /* ... */ }
};
```

### Edges as Relationships

Relationships are modeled as typed edges with optional properties:

```typescript
interface Edge {
  id: string;
  type: string;        // Relationship type
  target: string;      // Target entity ID
  properties?: any;    // Additional data
  weight?: number;     // Relationship strength
  temporal?: {         // Time-based relationships
    validFrom: Date;
    validTo?: Date;
  };
}
```

## Creating Relationships

### Basic Relationships

```typescript
import { FiberDB } from 'fiberdb';

const db = new FiberDB();
await db.initialize();

// Create a simple relationship
await db.addRelationship(
  'customer', 'cust-001',    // From entity
  'user', 'user-001',       // To entity
  'EMPLOYS',                // Relationship type
  {                         // Optional properties
    startDate: '2023-01-01',
    department: 'Engineering',
    role: 'Senior Developer'
  }
);
```

### Bidirectional Relationships

For true bidirectional relationships, create edges in both directions:

```typescript
// Employee works for company
await db.addRelationship('user', 'user-001', 'customer', 'cust-001', 'WORKS_FOR', {
  startDate: '2023-01-01',
  department: 'Engineering'
});

// Company employs employee
await db.addRelationship('customer', 'cust-001', 'user', 'user-001', 'EMPLOYS', {
  startDate: '2023-01-01',
  department: 'Engineering'
});
```

### Relationship with Properties

Store rich context with relationships:

```typescript
await db.addRelationship('user', 'user-001', 'project', 'proj-001', 'CONTRIBUTES_TO', {
  role: 'Lead Developer',
  contribution: 65,      // Percentage
  startDate: '2024-01-01',
  skills: ['TypeScript', 'Database Design'],
  approved: true
});
```

### Temporal Relationships

Model time-based relationships:

```typescript
await db.addRelationship('user', 'user-001', 'project', 'proj-001', 'ASSIGNED_TO', {
  temporal: {
    validFrom: new Date('2024-01-01'),
    validTo: new Date('2024-06-30')
  },
  allocation: 0.8  // 80% time allocation
});
```

### Weighted Relationships

Use weights to represent relationship strength:

```typescript
await db.addRelationship('customer', 'cust-001', 'product', 'prod-001', 'PURCHASED', {
  weight: 0.9,  // High importance relationship
  purchaseValue: 500000,
  frequency: 'monthly'
});
```

## Graph Traversal

### Basic Traversal

Find all entities connected to a starting entity:

```typescript
const customerNetwork = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'BOTH',     // 'OUT', 'IN', or 'BOTH'
    maxDepth: 2,
    edgeTypes: ['EMPLOYS', 'OWNS', 'USES']
  },
  returnType: 'NODES'
});

console.log(`Found ${customerNetwork.nodes?.length} connected entities`);
```

### Directional Traversal

Control traversal direction:

```typescript
// Find all entities this customer points to (outgoing relationships)
const outgoing = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'OUT',
    maxDepth: 3
  },
  returnType: 'NODES'
});

// Find all entities that point to this customer (incoming relationships)
const incoming = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'IN',
    maxDepth: 2
  },
  returnType: 'NODES'
});
```

### Filtered Traversal

Apply filters during traversal:

```typescript
// Find only active employees of a company
const activeEmployees = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'OUT',
    edgeTypes: ['EMPLOYS'],
    maxDepth: 1,
    nodeFilter: {           // Filter target nodes
      type: 'user',
      attributes: { active: true }
    },
    edgeFilter: {           // Filter relationships
      properties: { 
        department: 'Engineering',
        active: true 
      }
    }
  },
  returnType: 'NODES'
});
```

### Multi-Start Traversal

Start traversal from multiple entities:

```typescript
// Find network spanning multiple customers
const multiCustomerNetwork = await db.queryGraph({
  startNodes: ['customer:cust-001', 'customer:cust-002', 'customer:cust-003'],
  traversal: {
    direction: 'BOTH',
    maxDepth: 2,
    edgeTypes: ['EMPLOYS', 'PARTNERS_WITH', 'SUPPLIES']
  },
  returnType: 'NODES'
});
```

## Path Finding

### Basic Path Finding

Find paths between two entities:

```typescript
// Find how a customer connects to a product
const paths = await db.findPath('customer:cust-001', 'product:prod-001', 4);

if (paths.length > 0) {
  console.log('Shortest path:');
  paths[0].nodes.forEach((node, index) => {
    console.log(`${index + 1}. ${node}`);
  });
  
  console.log('Relationship chain:');
  paths[0].edges.forEach(edgeId => {
    console.log(`   -> ${edgeId}`);
  });
}
```

### Multiple Paths

Find all paths within a depth limit:

```typescript
const allPaths = await db.findPath('user:user-001', 'project:proj-001', 3);

allPaths.forEach((path, index) => {
  console.log(`Path ${index + 1} (length ${path.length}):`);
  console.log(path.nodes.join(' → '));
  if (path.weight) {
    console.log(`Total weight: ${path.weight}`);
  }
});
```

### Shortest Path Algorithm

The path finding uses depth-first search to find all paths, then sorts by length:

```typescript
// Paths are automatically sorted by length (shortest first)
const paths = await db.findPath('customer:cust-001', 'vendor:vend-001', 5);

const shortestPath = paths[0];  // Guaranteed to be shortest
const allShortPaths = paths.filter(p => p.length === shortestPath.length);
```

## Advanced Graph Queries

### Relationship Analysis

Find entities with specific relationship patterns:

```typescript
// Find customers who employ users that work on multiple projects
const results = await db.enhancedQuery({
  from: 'customer',
  where: {
    edges: {
      type: 'EMPLOYS',
      target: {
        // Target users must have outgoing 'WORKS_ON' relationships
        edges: {
          type: 'WORKS_ON',
          count: { $gte: 2 }  // Working on 2+ projects
        }
      }
    }
  }
});
```

### Subgraph Extraction

Extract a subgraph around specific entities:

```typescript
// Get 2-hop neighborhood around a user
const userSubgraph = await db.queryGraph({
  startNodes: ['user:user-001'],
  traversal: {
    direction: 'BOTH',
    maxDepth: 2
  },
  returnType: 'BOTH'  // Return both nodes and edges
});

// Analyze the subgraph
console.log(`Subgraph contains:`);
console.log(`- ${userSubgraph.nodes?.length} nodes`);
console.log(`- ${userSubgraph.edges?.length} relationships`);
```

### Relationship Traversal with Aggregation

Combine graph traversal with data aggregation:

```typescript
// Find all projects connected to a customer and their total budget
const customerProjects = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'OUT',
    edgeTypes: ['FUNDS', 'SPONSORS'],
    maxDepth: 3,
    nodeFilter: { type: 'project' }
  },
  returnType: 'NODES'
});

// Calculate total project budget
const totalBudget = customerProjects.nodes?.reduce((sum, project) => {
  return sum + (project.attributes.budget || 0);
}, 0);
```

## Graph Query Patterns

### Hub Detection

Find entities with many connections:

```typescript
// Find users with the most relationships
const hubAnalysis = await db.enhancedQuery({
  from: 'user',
  where: {
    edges: {
      count: { $gte: 10 }  // Users with 10+ relationships
    }
  }
});
```

### Relationship Chains

Find specific relationship patterns:

```typescript
// Customer → Employee → Project chain
const projectChains = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'OUT',
    maxDepth: 2,
    pathFilter: {
      // Must follow specific relationship pattern
      pattern: ['EMPLOYS', 'WORKS_ON']
    }
  },
  returnType: 'PATHS'
});
```

### Temporal Graph Queries

Query relationships within time periods:

```typescript
// Find relationships active during a specific period
const activeRelationships = await db.enhancedQuery({
  from: 'user',
  where: {
    edges: {
      temporal: {
        validFrom: { $lte: new Date('2024-06-01') },
        validTo: { $gte: new Date('2024-06-01') }
      }
    }
  }
});
```

## Performance Optimization

### Index Graph Queries

Create indexes for frequently queried relationship patterns:

```typescript
// Indexes are automatically created for:
// - Entity types
// - Edge types
// - Edge targets
// - Edge properties (when specified)

// Query performance is optimized for:
const fastQuery = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'OUT',
    edgeTypes: ['EMPLOYS'],  // Uses edge type index
    maxDepth: 1              // Limited depth
  },
  returnType: 'NODES'
});
```

### Limit Traversal Depth

Control memory usage and performance:

```typescript
// Good: Limited depth
const controlled = await db.queryGraph({
  startNodes: ['customer:cust-001'],
  traversal: {
    direction: 'BOTH',
    maxDepth: 3  // Reasonable limit
  },
  returnType: 'NODES'
});

// Avoid: Unlimited or very deep traversal
// maxDepth: 10  // May be slow for dense graphs
```

### Concurrent Graph Queries

Execute multiple graph queries in parallel:

```typescript
const [customerNetwork, userNetwork, productNetwork] = await Promise.all([
  db.queryGraph({
    startNodes: ['customer:cust-001'],
    traversal: { direction: 'BOTH', maxDepth: 2 },
    returnType: 'NODES'
  }),
  db.queryGraph({
    startNodes: ['user:user-001'],
    traversal: { direction: 'BOTH', maxDepth: 2 },
    returnType: 'NODES'
  }),
  db.queryGraph({
    startNodes: ['product:prod-001'],
    traversal: { direction: 'BOTH', maxDepth: 2 },
    returnType: 'NODES'
  })
]);
```

## Common Graph Patterns

### Organization Hierarchy

Model and query organizational structures:

```typescript
// Create hierarchy
await db.addRelationship('company', 'comp-001', 'department', 'dept-eng', 'HAS_DEPARTMENT');
await db.addRelationship('department', 'dept-eng', 'team', 'team-db', 'HAS_TEAM');
await db.addRelationship('team', 'team-db', 'user', 'user-001', 'HAS_MEMBER');

// Query hierarchy
const orgChart = await db.queryGraph({
  startNodes: ['company:comp-001'],
  traversal: {
    direction: 'OUT',
    edgeTypes: ['HAS_DEPARTMENT', 'HAS_TEAM', 'HAS_MEMBER'],
    maxDepth: 3
  },
  returnType: 'PATHS'
});
```

### Product Dependencies

Model software or product dependencies:

```typescript
// Create dependency graph
await db.addRelationship('product', 'app-001', 'product', 'database-001', 'DEPENDS_ON');
await db.addRelationship('product', 'database-001', 'product', 'storage-001', 'DEPENDS_ON');

// Find all dependencies
const dependencies = await db.queryGraph({
  startNodes: ['product:app-001'],
  traversal: {
    direction: 'OUT',
    edgeTypes: ['DEPENDS_ON'],
    maxDepth: 5
  },
  returnType: 'NODES'
});
```

### Social Networks

Model social connections:

```typescript
// Create social connections
await db.addRelationship('user', 'user-001', 'user', 'user-002', 'FRIENDS_WITH', {
  since: '2023-01-01',
  strength: 0.8
});

// Find friends of friends
const socialNetwork = await db.queryGraph({
  startNodes: ['user:user-001'],
  traversal: {
    direction: 'BOTH',
    edgeTypes: ['FRIENDS_WITH'],
    maxDepth: 2
  },
  returnType: 'NODES'
});
```

## Error Handling

### Common Graph Query Errors

```typescript
try {
  const result = await db.queryGraph({
    startNodes: ['nonexistent:entity'],
    traversal: { direction: 'BOTH', maxDepth: 2 },
    returnType: 'NODES'
  });
} catch (error) {
  if (error.message.includes('not found')) {
    console.error('Start node does not exist');
  }
}

try {
  const paths = await db.findPath('customer:cust-001', 'nonexistent:target', 3);
  if (paths.length === 0) {
    console.log('No path found between entities');
  }
} catch (error) {
  console.error('Path finding error:', error);
}
```

## Best Practices

### Relationship Design

1. **Use meaningful relationship types**: `EMPLOYS`, `OWNS`, `MANAGES` vs `RELATED`
2. **Consider direction**: Model relationships from the perspective of common queries
3. **Add context with properties**: Store relevant metadata with relationships
4. **Use weights for importance**: Represent relationship strength or importance

### Query Optimization

1. **Limit traversal depth**: Use reasonable `maxDepth` values
2. **Filter early**: Apply `nodeFilter` and `edgeFilter` to reduce result sets
3. **Use specific edge types**: Specify `edgeTypes` when possible
4. **Choose appropriate return types**: Only request needed data (NODES vs PATHS vs EDGES)

### Data Modeling

1. **Design for your queries**: Model relationships based on expected query patterns
2. **Avoid circular references**: Be careful with bidirectional relationships
3. **Use temporal data**: Model time-based relationships when relevant
4. **Consider relationship cardinality**: One-to-many vs many-to-many patterns

## Next Steps

- **Practice with Examples**: Run `bun run examples:enhanced` to see graph queries in action
- **Performance Testing**: Use `bun run benchmark:enhanced` to test graph query performance
- **Advanced Patterns**: Explore complex relationship modeling for your domain
- **Integration**: Combine graph queries with traditional filtering for powerful data analysis

Graph capabilities transform FiberDB from a document database into a powerful hybrid system capable of modeling and querying complex real-world relationships.