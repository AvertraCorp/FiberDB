/**
 * Enhanced FiberDB API Demo
 * 
 * This example demonstrates the new enhanced features of FiberDB:
 * - Unified entity model (attributes, documents, edges)
 * - Graph relationships and traversal
 * - ACID compliance with WAL
 * - Advanced querying capabilities
 * - Backward compatibility with legacy API
 */

import { 
  FiberDB, 
  Entity, 
  Edge, 
  EnhancedQueryParams,
  GraphQueryParams
} from '../src/index';

async function runEnhancedAPIDemo() {
  console.log('=== FiberDB Enhanced API Demo ===\n');
  
  // Initialize FiberDB with enhanced storage engine
  const db = new FiberDB('./demo-data');
  await db.initialize();
  
  console.log('✅ FiberDB initialized with enhanced storage engine\n');

  // === 1. ENTITY MANAGEMENT ===
  console.log('1. Creating entities with unified model...');
  
  // Create a customer entity
  const customer: Entity = {
    id: 'cust-001',
    type: 'customer',
    attributes: {
      name: 'Acme Corporation',
      email: 'contact@acme.com',
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
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
          terms: 'Standard enterprise agreement'
        }
      ],
      communications: [
        {
          date: new Date(),
          type: 'email',
          subject: 'Welcome to FiberDB',
          content: 'Thank you for choosing our enhanced database solution'
        }
      ]
    },
    edges: [], // Will add relationships later
    metadata: {
      created: new Date(),
      updated: new Date(),
      version: 1,
      schemaVersion: 1,
      tags: ['enterprise', 'tech-company']
    }
  };

  await db.saveEntity(customer);
  console.log('  ✅ Customer entity created');

  // Create a product entity
  const product: Entity = {
    id: 'prod-001',
    type: 'product',
    attributes: {
      name: 'FiberDB Enterprise',
      description: 'Production-ready hybrid database',
      price: 999,
      category: 'Database Software',
      features: ['ACID compliance', 'Graph relationships', 'Real-time queries']
    },
    documents: {
      specifications: [
        {
          version: '2.0',
          releaseDate: new Date(),
          features: ['WAL support', 'Concurrent access', 'Auto-indexing']
        }
      ],
      reviews: [
        {
          rating: 5,
          comment: 'Excellent performance and features',
          reviewer: 'Tech Lead at Acme'
        }
      ]
    },
    edges: [],
    metadata: {
      created: new Date(),
      updated: new Date(),
      version: 1,
      schemaVersion: 1,
      tags: ['database', 'enterprise']
    }
  };

  await db.saveEntity(product);
  console.log('  ✅ Product entity created');

  // Create a user entity
  const user: Entity = {
    id: 'user-001',
    type: 'user',
    attributes: {
      name: 'John Smith',
      email: 'john@acme.com',
      role: 'Database Administrator',
      permissions: ['read', 'write', 'admin'],
      lastLogin: new Date()
    },
    documents: {
      activity_logs: [
        {
          timestamp: new Date(),
          action: 'login',
          details: 'Successful authentication'
        }
      ],
      preferences: [
        {
          theme: 'dark',
          notifications: true,
          autoSave: true
        }
      ]
    },
    edges: [],
    metadata: {
      created: new Date(),
      updated: new Date(),
      version: 1,
      schemaVersion: 1,
      tags: ['admin-user']
    }
  };

  await db.saveEntity(user);
  console.log('  ✅ User entity created\n');

  // === 2. RELATIONSHIP MANAGEMENT ===
  console.log('2. Creating relationships between entities...');
  
  // Customer owns products (purchases)
  await db.addRelationship(
    'customer', 'cust-001',
    'product', 'prod-001',
    'PURCHASED',
    {
      purchaseDate: new Date('2024-01-15'),
      licenseType: 'enterprise',
      quantity: 1,
      totalValue: 999
    }
  );
  console.log('  ✅ Customer -> Product relationship created');

  // User belongs to customer
  await db.addRelationship(
    'user', 'user-001',
    'customer', 'cust-001',
    'WORKS_FOR',
    {
      startDate: new Date('2023-01-01'),
      position: 'Database Administrator',
      department: 'IT'
    }
  );
  console.log('  ✅ User -> Customer relationship created');

  // User uses product
  await db.addRelationship(
    'user', 'user-001',
    'product', 'prod-001',
    'USES',
    {
      accessLevel: 'admin',
      frequency: 'daily',
      lastAccessed: new Date()
    }
  );
  console.log('  ✅ User -> Product relationship created\n');

  // === 3. ENHANCED QUERYING ===
  console.log('3. Demonstrating enhanced query capabilities...');

  // Query entities with complex filters
  const techCustomers = await db.enhancedQuery({
    from: 'customer',
    where: {
      attributes: {
        industry: 'Technology',
        active: true,
        revenue: { $gte: 1000000 }
      }
    },
    include: ['attributes', 'metadata.tags']
  });
  
  console.log(`  ✅ Found ${techCustomers.entities.length} technology customers with revenue >= $1M`);

  // Query with document filters
  const recentCommunications = await db.enhancedQuery({
    from: 'customer',
    where: {
      documents: {
        communications: { $exists: true }
      }
    },
    include: ['attributes.name', 'documents.communications']
  });
  
  console.log(`  ✅ Found ${recentCommunications.entities.length} customers with recent communications`);

  // Query with relationship filters
  const adminUsers = await db.enhancedQuery({
    from: 'user',
    where: {
      attributes: { 
        permissions: { $in: ['admin'] }
      },
      edges: {
        type: 'WORKS_FOR'
      }
    }
  });
  
  console.log(`  ✅ Found ${adminUsers.entities.length} admin users with company relationships\n`);

  // === 4. GRAPH TRAVERSAL ===
  console.log('4. Demonstrating graph traversal capabilities...');

  // Find all entities connected to a customer
  const customerNetwork = await db.queryGraph({
    startNodes: ['customer:cust-001'],
    traversal: {
      direction: 'BOTH',
      maxDepth: 2,
      nodeFilter: {},
      edgeFilter: {}
    },
    returnType: 'NODES'
  });
  
  console.log(`  ✅ Customer network contains ${customerNetwork.nodes?.length || 0} connected entities`);

  // Find paths between user and product
  const userToProductPaths = await db.findPath('user:user-001', 'product:prod-001', 3);
  console.log(`  ✅ Found ${userToProductPaths.length} paths from user to product`);
  
  if (userToProductPaths.length > 0) {
    console.log(`     Shortest path: ${userToProductPaths[0].nodes.join(' -> ')}`);
  }

  // Advanced graph query - find all products used by company employees
  const companyProducts = await db.queryGraph({
    startNodes: ['customer:cust-001'],
    traversal: {
      direction: 'IN',
      edgeTypes: ['WORKS_FOR'],
      maxDepth: 1,
      nodeFilter: { type: 'user' }
    },
    returnType: 'NODES'
  });
  
  console.log(`  ✅ Found ${companyProducts.nodes?.length || 0} employees of the customer\n`);

  // === 5. BACKWARD COMPATIBILITY ===
  console.log('5. Demonstrating backward compatibility...');

  // Use legacy API alongside enhanced API
  await db.saveAnchor('legacy_entity', 'leg-001', {
    name: 'Legacy Entity',
    description: 'Created with legacy API'
  });

  await db.attachToAnchor('leg-001', 'notes', {
    note: 'This entity was created using the legacy saveAnchor method',
    timestamp: new Date()
  });

  // Query using legacy format
  const legacyResults = await db.query({
    primary: 'legacy_entity',
    filter: { name: 'Legacy Entity' }
  });

  console.log(`  ✅ Legacy API query returned ${legacyResults.length} results`);
  console.log(`     Entity has attachments: ${legacyResults[0]?.attachments ? 'Yes' : 'No'}\n`);

  // === 6. PERFORMANCE METRICS ===
  console.log('6. Storage and performance statistics...');
  
  const stats = await db.getStats();
  console.log('  Storage Statistics:');
  console.log(`    Total entities: ${stats.totalEntities}`);
  console.log(`    Total relationships: ${stats.totalEdges}`);
  console.log(`    Storage size: ${(stats.storageSize / 1024).toFixed(2)} KB`);
  console.log(`    Index size: ${(stats.indexSize / 1024).toFixed(2)} KB`);
  console.log(`    Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`    Average query time: ${stats.averageQueryTime.toFixed(2)}ms\n`);

  // === 7. ADVANCED FEATURES ===
  console.log('7. Advanced features demonstration...');

  // Bulk operations
  const bulkEntities: Entity[] = [];
  for (let i = 0; i < 5; i++) {
    bulkEntities.push({
      id: `bulk-${i}`,
      type: 'test_entity',
      attributes: {
        name: `Bulk Entity ${i}`,
        value: i * 10,
        category: i % 2 === 0 ? 'even' : 'odd'
      },
      documents: {
        metadata: [{ created_at: new Date(), batch: 'demo' }]
      },
      edges: [],
      metadata: {
        created: new Date(),
        updated: new Date(),
        version: 1,
        schemaVersion: 1
      }
    });
  }

  // Save entities concurrently
  const startTime = Date.now();
  await Promise.all(bulkEntities.map(entity => db.saveEntity(entity)));
  const bulkSaveTime = Date.now() - startTime;
  
  console.log(`  ✅ Bulk saved 5 entities in ${bulkSaveTime}ms`);

  // Aggregation query
  const aggregatedResults = await db.enhancedQuery({
    from: 'test_entity',
    where: {
      attributes: { category: 'even' }
    },
    limit: 10
  });
  
  console.log(`  ✅ Aggregation query found ${aggregatedResults.entities.length} even-numbered entities`);

  // Close the database
  await db.close();
  console.log('\n✅ FiberDB connection closed');
  
  console.log('\n=== Demo completed successfully! ===');
  console.log('\nKey improvements demonstrated:');
  console.log('• Unified entity model with attributes, documents, and edges');
  console.log('• ACID compliance with Write-Ahead Logging');
  console.log('• Advanced indexing and query performance');
  console.log('• Graph relationships and traversal capabilities');
  console.log('• Concurrent operations with proper locking');
  console.log('• Full backward compatibility with legacy API');
  console.log('• Production-ready features (monitoring, configuration, Docker)');
}

// Run the demo
if (import.meta.main) {
  runEnhancedAPIDemo().catch(console.error);
}

export { runEnhancedAPIDemo };