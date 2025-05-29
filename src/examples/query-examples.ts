declare global {
  var validBpId: string;
}

/**
 * FiberDB Query Examples - Legacy and Enhanced API
 * 
 * This file contains comprehensive examples of both the legacy API (for backward compatibility)
 * and the new enhanced API with graph capabilities. Use these examples as a reference for
 * building your own queries.
 * 
 * IMPORTANT: Before running these examples, you must seed the database with test data:
 * 
 * ```bash
 * # Generate SAP Utilities test data (50 business partners)
 * bun run seed:sap
 * 
 * # Or generate a larger dataset (200 business partners)
 * bun run seed:sap-large
 * ```
 * 
 * Without seeding, all queries will return empty results as there is no data to query.
 */

// Legacy API imports (backward compatible)
import { query, runStructuredQuery, runStructuredQueryAsync } from "../core/query";
import { saveAnchor, attachToAnchor } from "../core/storage";

// Enhanced API imports (new capabilities)
import { FiberDB, Entity, defaultFiberDB } from "../api/fiberdb";

import config from "../config";
import fs from "fs";
import path from "path";

// Optional: Configure performance settings
config.performance.defaultParallel = true;  // Enable parallel processing by default
config.performance.logMetrics = true;       // Log performance metrics to console

/**
 * LEGACY API EXAMPLES (Backward Compatible)
 */

/**
 * Basic Query Examples using Legacy API
 */
async function legacyBasicQueryExamples() {
  console.log("=== Legacy API: Basic Query Examples ===");

  // Get a valid business partner ID from the global one passed from runAllExamples
  const validBpId = global.validBpId || (() => {
    const fs = require("fs");
    const path = require("path");
    const bpDir = path.join("data", "anchors", "business-partner");
    const validBusinessPartners = fs.existsSync(bpDir) ? fs.readdirSync(bpDir) : [];
    return validBusinessPartners.length > 0 
      ? validBusinessPartners[0]!.replace(".json", "") 
      : "BP01400152"; // Fallback
  })();

  console.log("Using valid business partner ID:", validBpId);
  
  // Basic ID query - fetch single entity by valid ID
  try {
    const singleEntityResult = await query({
      primary: "business-partner",
      id: validBpId,
      skipTTL: true // Skip TTL filtering for historical data
    });
    console.log("Legacy: Single entity query result:", singleEntityResult);
  } catch (error) {
    console.error("Error in legacy ID query:", error);
  }

  // Query all entities of a type
  const allEntitiesResult = await query({
    primary: "business-partner",
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Legacy: All entities query result count:", allEntitiesResult.length);

  // Select specific fields
  const selectedFieldsResult = await query({
    primary: "business-partner",
    id: global.validBpId || validBpId,
    include: ["id", "firstName", "lastName", "customerClassification", "industrySector"],
    skipTTL: true,
    useParallel: false
  });
  console.log("Legacy: Selected fields query result:", selectedFieldsResult);
}

/**
 * Legacy Filtering Examples
 */
async function legacyFilteringExamples() {
  console.log("\n=== Legacy API: Filtering Examples ===");

  // Basic equality filter on primary entity
  const equalityFilterResult = await query({
    primary: "business-partner",
    filter: { customerClassification: "B" },
    skipTTL: true
  });
  console.log("Legacy: Equality filter result count:", equalityFilterResult.length);

  // Filter on attached documents
  const attachmentFilterResult = await query({
    primary: "business-partner",
    include: ["id", "organizationName", "customerClassification", "addresses"],
    where: { 
      "addresses.country": "LB" 
    },
    skipTTL: true
  });
  console.log("Legacy: Attachment filter result count:", attachmentFilterResult.length);
}

/**
 * ENHANCED API EXAMPLES (New Capabilities)
 */

/**
 * Enhanced API: Entity Management Examples
 */
async function enhancedEntityExamples() {
  console.log("\n=== Enhanced API: Entity Management Examples ===");

  const db = new FiberDB();
  await db.initialize();

  // Create a new entity using enhanced API
  const customer: Entity = {
    id: 'demo-cust-001',
    type: 'customer',
    attributes: {
      name: 'Demo Corporation',
      industry: 'Technology',
      founded: new Date('2020-01-01'),
      revenue: 2000000,
      active: true
    },
    documents: {
      contracts: [{
        id: 'demo-contract-001',
        value: 150000,
        startDate: '2024-01-01',
        status: 'active'
      }],
      communications: [{
        date: new Date(),
        type: 'email',
        subject: 'Welcome to Enhanced FiberDB',
        content: 'Thank you for trying our enhanced features'
      }]
    },
    edges: [], // Relationships added separately
    metadata: {
      created: new Date(),
      updated: new Date(),
      version: 1,
      schemaVersion: 1,
      tags: ['demo', 'enhanced-api']
    }
  };

  await db.saveEntity(customer);
  console.log("Enhanced: Created new entity with ID:", customer.id);

  // Retrieve the entity
  const retrievedEntity = await db.getEntity('customer', 'demo-cust-001');
  if (retrievedEntity) {
    console.log("Enhanced: Retrieved entity:", {
      id: retrievedEntity.id,
      name: retrievedEntity.attributes.name,
      contractsCount: retrievedEntity.documents.contracts?.length || 0
    });
  }
}

/**
 * Enhanced API: Relationship Examples
 */
async function enhancedRelationshipExamples() {
  console.log("\n=== Enhanced API: Relationship Examples ===");

  const db = new FiberDB();
  await db.initialize();

  // Create additional entities for relationships
  const user: Entity = {
    id: 'demo-user-001',
    type: 'user',
    attributes: {
      name: 'John Smith',
      email: 'john@democorp.com',
      role: 'Database Administrator',
      active: true
    },
    documents: {
      activity_logs: [{
        timestamp: new Date(),
        action: 'login',
        details: 'Accessed enhanced FiberDB features'
      }]
    },
    edges: [],
    metadata: {
      created: new Date(),
      updated: new Date(),
      version: 1,
      schemaVersion: 1
    }
  };

  const product: Entity = {
    id: 'demo-prod-001',
    type: 'product',
    attributes: {
      name: 'FiberDB Enterprise',
      description: 'Enhanced hybrid database',
      price: 999,
      category: 'Database Software'
    },
    documents: {
      specifications: [{
        version: '2.0',
        features: ['ACID compliance', 'Graph relationships', 'Real-time queries']
      }]
    },
    edges: [],
    metadata: {
      created: new Date(),
      updated: new Date(),
      version: 1,
      schemaVersion: 1
    }
  };

  await db.saveEntity(user);
  await db.saveEntity(product);

  // Create relationships
  await db.addRelationship('customer', 'demo-cust-001', 'user', 'demo-user-001', 'EMPLOYS', {
    startDate: '2023-01-01',
    department: 'IT',
    role: 'Database Administrator'
  });

  await db.addRelationship('customer', 'demo-cust-001', 'product', 'demo-prod-001', 'PURCHASED', {
    purchaseDate: '2024-01-15',
    licenseType: 'enterprise',
    quantity: 1
  });

  await db.addRelationship('user', 'demo-user-001', 'product', 'demo-prod-001', 'USES', {
    accessLevel: 'admin',
    frequency: 'daily'
  });

  console.log("Enhanced: Created relationships between customer, user, and product");

  // Verify relationships were created
  const customerWithEdges = await db.getEntity('customer', 'demo-cust-001');
  if (customerWithEdges) {
    console.log("Enhanced: Customer now has", customerWithEdges.edges.length, "relationships");
    customerWithEdges.edges.forEach(edge => {
      console.log(`  - ${edge.type} relationship to ${edge.target}`);
    });
  }
}

/**
 * Enhanced API: Graph Query Examples
 */
async function enhancedGraphQueryExamples() {
  console.log("\n=== Enhanced API: Graph Query Examples ===");

  const db = new FiberDB();
  await db.initialize();

  // Find all entities connected to our demo customer
  try {
    const customerNetwork = await db.queryGraph({
      startNodes: ['customer:demo-cust-001'],
      traversal: {
        direction: 'BOTH',
        maxDepth: 2,
        edgeTypes: ['EMPLOYS', 'PURCHASED', 'USES']
      },
      returnType: 'NODES'
    });

    console.log("Enhanced: Customer network contains", customerNetwork.nodes?.length || 0, "connected entities");

    // Find paths between customer and product
    const paths = await db.findPath('customer:demo-cust-001', 'product:demo-prod-001', 3);
    console.log("Enhanced: Found", paths.length, "paths from customer to product");
    
    if (paths.length > 0) {
      console.log("Enhanced: Shortest path:", paths[0].nodes.join(' → '));
    }

    // Advanced graph query with filters
    const engineeringNetwork = await db.queryGraph({
      startNodes: ['customer:demo-cust-001'],
      traversal: {
        direction: 'OUT',
        edgeTypes: ['EMPLOYS'],
        maxDepth: 1,
        nodeFilter: { type: 'user' },
        edgeFilter: { 
          properties: { department: 'IT' } 
        }
      },
      returnType: 'NODES'
    });

    console.log("Enhanced: IT department network contains", engineeringNetwork.nodes?.length || 0, "entities");
  } catch (error) {
    console.error("Enhanced: Graph query error:", error);
  }
}

/**
 * Enhanced API: Advanced Query Examples
 */
async function enhancedAdvancedQueryExamples() {
  console.log("\n=== Enhanced API: Advanced Query Examples ===");

  const db = new FiberDB();
  await db.initialize();

  // Complex query with multiple filters
  const techCustomers = await db.enhancedQuery({
    from: 'customer',
    where: {
      attributes: {
        industry: 'Technology',
        active: true,
        revenue: { $gte: 1000000 }
      },
      documents: {
        contracts: { $exists: true }
      }
    },
    include: ['attributes.name', 'attributes.revenue', 'documents.contracts'],
    limit: 10
  });

  console.log("Enhanced: Found", techCustomers.entities.length, "technology customers with revenue >= $1M");

  // Query with relationship filters
  const customersWithActiveUsers = await db.enhancedQuery({
    from: 'customer',
    where: {
      edges: {
        type: 'EMPLOYS',
        target: { $regex: 'user:' }
      }
    },
    include: ['attributes.name']
  });

  console.log("Enhanced: Found", customersWithActiveUsers.entities.length, "customers with employees");

  // Pagination example
  const paginatedResults = await db.enhancedQuery({
    from: 'customer',
    limit: 5,
    offset: 0
  });

  console.log("Enhanced: Page 1 contains", paginatedResults.entities.length, "customers");
  console.log("Enhanced: Total customers:", paginatedResults.metadata.total);
}

/**
 * Enhanced API: Performance and Statistics
 */
async function enhancedPerformanceExamples() {
  console.log("\n=== Enhanced API: Performance Examples ===");

  const db = new FiberDB();
  await db.initialize();

  // Get storage statistics
  const stats = await db.getStats();
  console.log("Enhanced: Storage Statistics:");
  console.log("  Total entities:", stats.totalEntities);
  console.log("  Total relationships:", stats.totalEdges);
  console.log("  Storage size:", Math.round(stats.storageSize / 1024), "KB");
  console.log("  Cache hit rate:", Math.round(stats.cacheHitRate * 100), "%");
  console.log("  Average query time:", stats.averageQueryTime.toFixed(2), "ms");

  // Concurrent operations example
  console.log("\nEnhanced: Testing concurrent operations...");
  const startTime = Date.now();
  
  const concurrentQueries = await Promise.all([
    db.enhancedQuery({ from: 'customer', limit: 10 }),
    db.enhancedQuery({ from: 'user', limit: 10 }),
    db.enhancedQuery({ from: 'product', limit: 10 })
  ]);

  const concurrentTime = Date.now() - startTime;
  console.log("Enhanced: Concurrent queries completed in", concurrentTime, "ms");
  console.log("Enhanced: Results:", concurrentQueries.map(r => r.entities.length), "entities each");
}

/**
 * Backward Compatibility Examples
 */
async function backwardCompatibilityExamples() {
  console.log("\n=== Backward Compatibility Examples ===");

  // Show that legacy API still works with enhanced storage
  console.log("Creating data with legacy API...");
  
  await saveAnchor('demo_legacy', 'legacy-001', {
    name: 'Legacy Entity',
    description: 'Created with legacy saveAnchor method',
    type: 'demonstration'
  });

  await attachToAnchor('legacy-001', 'notes', {
    note: 'This attachment was created using legacy attachToAnchor method',
    timestamp: new Date(),
    author: 'Legacy API'
  });

  // Query using legacy method
  const legacyResults = await query({
    primary: 'demo_legacy',
    filter: { name: 'Legacy Entity' },
    include: ['name', 'description', 'notes']
  });

  console.log("Legacy API query results:", legacyResults.length, "entities");
  if (legacyResults.length > 0) {
    console.log("Legacy entity has notes:", legacyResults[0].notes ? 'Yes' : 'No');
  }

  // Query the same data using enhanced API
  const db = new FiberDB();
  await db.initialize();
  
  const enhancedResults = await db.enhancedQuery({
    from: 'demo_legacy',
    where: {
      attributes: { name: 'Legacy Entity' }
    }
  });

  console.log("Enhanced API query of legacy data:", enhancedResults.entities.length, "entities");
  if (enhancedResults.entities.length > 0) {
    const entity = enhancedResults.entities[0];
    console.log("Enhanced view of legacy entity:");
    console.log("  Attributes:", Object.keys(entity.attributes));
    console.log("  Documents:", Object.keys(entity.documents));
    console.log("  Edges:", entity.edges.length);
  }
}

/**
 * API Usage Examples (for reference when using HTTP API)
 */
function apiExamples() {
  console.log("\n=== HTTP API Request Examples ===");

  // Legacy API endpoint examples
  console.log("Legacy API query:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/query \\
    -H "Content-Type: application/json" \\
    -d '{
      "primary": "business-partner",
      "filter": { "customerClassification": "A" },
      "include": ["firstName", "lastName", "contracts"],
      "where": {
        "contracts.status": "ACTIVE"
      },
      "skipTTL": true
    }'
  `);

  // Enhanced API endpoints (when available)
  console.log("\nEnhanced API entity query:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/api/enhanced/query \\
    -H "Content-Type: application/json" \\
    -d '{
      "from": "customer",
      "where": {
        "attributes": { "industry": "Technology" },
        "edges": { "type": "EMPLOYS" }
      },
      "limit": 10
    }'
  `);

  console.log("\nEnhanced API graph query:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/api/enhanced/graph \\
    -H "Content-Type: application/json" \\
    -d '{
      "startNodes": ["customer:cust-001"],
      "traversal": {
        "direction": "BOTH",
        "maxDepth": 3,
        "edgeTypes": ["EMPLOYS", "USES"]
      },
      "returnType": "NODES"
    }'
  `);
}

/**
 * Migration Examples
 */
async function migrationExamples() {
  console.log("\n=== Migration Examples ===");

  console.log("To migrate from file storage to enhanced storage:");
  console.log("1. Create backup: cp -r ./data ./data_backup");
  console.log("2. Run migration: bun run migrate --old-path ./data --new-path ./data_v2");
  console.log("3. Validate: bun run migrate:validate --new-path ./data_v2");
  console.log("4. Update config: export FIBERDB_ENGINE=custom");
  console.log("5. Update data path: export FIBERDB_DATA_PATH=./data_v2");

  console.log("\nMigration preserves all data and infers relationships:");
  console.log("- Anchors → entity.attributes");
  console.log("- Attachments → entity.documents");  
  console.log("- ID references → entity.edges (inferred)");
  console.log("- Legacy API continues to work unchanged");
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log("Running FiberDB Query Examples - Legacy and Enhanced API\n");
  
  // Import modules
  const fs = await import("fs");
  const path = await import("path");
  
  // Check config
  console.log("Config baseDir:", config.storage.baseDir);
  
  // Get a valid business partner ID for all examples
  const bpDir = path.join("data", "anchors", "business-partner");
  const validBusinessPartners = fs.existsSync(bpDir) ? fs.readdirSync(bpDir) : [];
  const validBpId = validBusinessPartners.length > 0 
    ? validBusinessPartners[0]!.replace(".json", "") 
    : "BP01400152"; // Fallback

  // Make it available globally
  global.validBpId = validBpId;
  console.log("Using valid business partner ID for examples:", validBpId);

  try {
    // Legacy API examples (backward compatible)
    await legacyBasicQueryExamples();
    await legacyFilteringExamples();

    // Enhanced API examples (new capabilities)
    await enhancedEntityExamples();
    await enhancedRelationshipExamples();
    await enhancedGraphQueryExamples();
    await enhancedAdvancedQueryExamples();
    await enhancedPerformanceExamples();

    // Compatibility demonstrations
    await backwardCompatibilityExamples();

    // Reference information
    apiExamples();
    await migrationExamples();

    console.log("\n🎉 All examples completed successfully!");
    console.log("\nKey takeaways:");
    console.log("✅ Legacy API continues to work unchanged");
    console.log("✅ Enhanced API adds graph relationships and advanced queries");
    console.log("✅ Both APIs can be used together in the same application");
    console.log("✅ Migration preserves all data while adding new capabilities");
    
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

// Execute examples when run directly
if (import.meta.main) {
  runAllExamples()
    .catch(err => {
      console.error("Error running examples:", err);
    });
}