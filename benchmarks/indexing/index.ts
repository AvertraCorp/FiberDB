/**
 * Indexing Performance Benchmark
 */
import fs from 'fs';
import { saveAnchor, attachToAnchor } from '../../src/core/storage';
import { runStructuredQuery } from '../../src/core/query';
import { documentCache, queryCache, fileExistsCache } from '../../src/utils/cache';
import { 
  createHashIndex, 
  createRangeIndex,
  createTextIndex,
  listIndexes,
  getIndexStats
} from '../../src/core/indexing';

// Utility to format numbers with commas
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Utility to measure time
async function measureTime<T>(fn: () => Promise<T> | T): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return [result, end - start];
}

// Generate larger test data set
async function generateTestData(count: number) {
  console.log(`\nGenerating ${count} test customer records with attachments...`);
  
  // Clear existing data
  if (fs.existsSync('data')) {
    fs.rmSync('data', { recursive: true, force: true });
  }
  
  // Clear caches
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  const regions = ['NW', 'SW', 'NE', 'SE', 'MW'];
  const types = ['Billing Error', 'Power Outage', 'Service Request', 'Maintenance'];
  const statuses = ['open', 'closed', 'pending', 'in-progress'];
  
  // Create different customers
  for (let i = 1; i <= count; i++) {
    const id = `cust:${i.toString().padStart(3, '0')}`;
    saveAnchor('customer', id, {
      id,
      name: `Customer ${i}`,
      region: regions[i % regions.length],
      customerCode: `C${(10000 + i).toString()}`,
      active: i % 10 !== 0, // 90% of customers are active
    });
    
    // Add 5-10 random attached documents for each customer
    const docCount = 5 + Math.floor(Math.random() * 6);
    for (let j = 0; j < docCount; j++) {
      attachToAnchor(id, 'service-requests', {
        type: types[Math.floor(Math.random() * types.length)],
        created_at: new Date().toISOString(),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        priority: Math.floor(Math.random() * 5) + 1,
        description: `Service request ${j + 1} for customer ${i}`
      });
    }
    
    // Add some chat messages
    const chatCount = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < chatCount; k++) {
      attachToAnchor(id, 'chat', {
        message: `Message ${k + 1} from customer ${i}`,
        timestamp: new Date().toISOString(),
        agent: Math.random() > 0.5 ? 'system' : 'human'
      });
    }
  }
  
  console.log(`Created ${count} customers with attachments.`);
}

// Create indexes for the test data
async function createTestIndexes() {
  console.log('\nCreating indexes for test data...');
  
  const indexResults = [];
  
  // Hash index for customer region
  indexResults.push(await createHashIndex('customer', 'region', {
    name: 'Customer Region Index'
  }));
  
  // Hash index for customer active status
  indexResults.push(await createHashIndex('customer', 'active', {
    name: 'Customer Active Status Index'
  }));
  
  // Text index for customer name
  indexResults.push(await createTextIndex('customer', 'name', {
    name: 'Customer Name Text Index',
    isCaseSensitive: false
  }));
  
  // Range index for attached service request priority
  indexResults.push(await createRangeIndex('customer', 'priority', {
    name: 'Service Request Priority Index',
    attachedType: 'service-requests'
  }));
  
  // Hash index for attached service request status
  indexResults.push(await createHashIndex('customer', 'status', {
    name: 'Service Request Status Index',
    attachedType: 'service-requests'
  }));
  
  // Text index for attached service request description
  indexResults.push(await createTextIndex('customer', 'description', {
    name: 'Service Request Description Index',
    attachedType: 'service-requests',
    isCaseSensitive: false
  }));
  
  // Hash index for chat agent
  indexResults.push(await createHashIndex('customer', 'agent', {
    name: 'Chat Agent Index',
    attachedType: 'chat'
  }));
  
  console.log(`Created ${indexResults.filter(Boolean).length} indexes.`);
  
  // List all indexes
  const indexes = listIndexes();
  console.log(`\nAvailable indexes (${indexes.length}):`);
  indexes.forEach(idx => {
    console.log(`- ${idx.name} (${idx.id}): ${idx.entityType}${idx.attachedType ? '.' + idx.attachedType : ''}.${idx.field}`);
  });
}

// Run query performance tests
async function runQueryTests() {
  console.log('\n=== Testing Index Performance ===');
  
  const testQueries = [
    {
      name: 'Filter on Customer Region (Hash Index)',
      query: {
        primary: 'customer',
        filter: { region: 'NW' },
        include: ['name', 'region'],
        skipCache: true
      }
    },
    {
      name: 'Filter on Customer Active Status (Hash Index)',
      query: {
        primary: 'customer',
        filter: { active: true },
        include: ['name', 'active'],
        skipCache: true
      }
    },
    {
      name: 'Filter on Service Request Status (Hash Index on Attached)',
      query: {
        primary: 'customer',
        include: ['name', 'region', 'service-requests'],
        where: {
          'service-requests.status': { eq: 'closed' }
        },
        skipCache: true
      }
    },
    {
      name: 'Text Search in Service Request Description (Text Index)',
      query: {
        primary: 'customer',
        include: ['name', 'region', 'service-requests'],
        where: {
          'service-requests.description': { contains: 'customer' }
        },
        skipCache: true
      }
    },
    {
      name: 'Range Query on Service Request Priority (Range Index)',
      query: {
        primary: 'customer',
        include: ['name', 'region', 'service-requests'],
        where: {
          'service-requests.priority': { gt: 3 }
        },
        skipCache: true
      }
    },
    {
      name: 'Combined Filters (Multiple Indexes)',
      query: {
        primary: 'customer',
        filter: { active: true },
        include: ['name', 'region', 'service-requests'],
        where: {
          'service-requests.status': { eq: 'open' },
          'service-requests.priority': { gt: 2 }
        },
        skipCache: true
      }
    }
  ];
  
  // Run each test query with and without indexes
  for (const test of testQueries) {
    console.log(`\n## Testing: ${test.name}`);
    
    // Clear caches
    documentCache.clear();
    queryCache.clear();
    fileExistsCache.clear();
    
    // Run without indexes
    console.log('\n1. Without using indexes:');
    const queryWithoutIndexes = { ...test.query, useIndexes: false };
    const [resultWithoutIndexes, timeWithoutIndexes] = await measureTime(() => 
      runStructuredQuery(queryWithoutIndexes)
    );
    
    console.log(`   Time: ${timeWithoutIndexes.toFixed(2)}ms`);
    console.log(`   Results: ${resultWithoutIndexes.length} customers`);
    
    // Clear caches
    documentCache.clear();
    queryCache.clear();
    fileExistsCache.clear();
    
    // Run with indexes
    console.log('\n2. Using indexes:');
    const queryWithIndexes = { ...test.query, useIndexes: true };
    const [resultWithIndexes, timeWithIndexes] = await measureTime(() => 
      runStructuredQuery(queryWithIndexes)
    );
    
    console.log(`   Time: ${timeWithIndexes.toFixed(2)}ms`);
    console.log(`   Results: ${resultWithIndexes.length} customers`);
    
    // Calculate improvement
    const improvement = ((timeWithoutIndexes - timeWithIndexes) / timeWithoutIndexes * 100);
    console.log(`\n   Performance Improvement: ${improvement.toFixed(1)}%`);
    console.log(`   Without Indexes: ${timeWithoutIndexes.toFixed(2)}ms vs With Indexes: ${timeWithIndexes.toFixed(2)}ms`);
    
    // Verify result correctness
    if (resultWithoutIndexes.length !== resultWithIndexes.length) {
      console.log('\n   ⚠️ WARNING: Result count mismatch!');
      console.log(`      Without Indexes: ${resultWithoutIndexes.length} results`);
      console.log(`      With Indexes: ${resultWithIndexes.length} results`);
    }
  }
  
  // Show index stats
  console.log('\n## Index Usage Statistics:');
  const stats = getIndexStats();
  if (stats.length > 0) {
    stats.sort((a, b) => b.hits - a.hits); // Sort by most used
    
    stats.forEach(stat => {
      console.log(`- ${stat.id}: ${stat.hits} hits, avg time: ${stat.avgLookupTime.toFixed(2)}ms`);
    });
  } else {
    console.log('No index usage statistics available');
  }
}

// Run the complete test suite
async function runTests() {
  console.log('=== FiberDB Indexing Performance Test ===');
  
  // Generate test data
  await generateTestData(200);
  
  // Create indexes
  await createTestIndexes();
  
  // Run performance tests
  await runQueryTests();
  
  console.log('\n=== Test Complete ===');
}

// Run the tests if this is the main module
if (import.meta.main) {
  runTests();
}

export { runTests };