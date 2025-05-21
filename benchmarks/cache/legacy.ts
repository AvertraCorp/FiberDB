// test-cache-performance.ts
import { runStructuredQuery } from "./core/query-fabric";
import { saveAnchor } from "./core/insert";
import { attachToAnchor } from "./core/insert";
import { getAllCacheStats, documentCache, queryCache, fileExistsCache } from "./core/utils/cache";

// Utility to measure time
function measureTime(fn: () => any): [any, number] {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return [result, end - start];
}

// Generate realistic test data
async function generateTestData(count: number) {
  const regions = ["NW", "SW", "NE", "SE", "MW"];
  const types = ["Billing Error", "Power Outage", "Service Request", "Maintenance"];
  const statuses = ["open", "closed", "pending", "in-progress"];
  
  console.log(`Generating ${count} test records...`);
  
  // Create different customers
  for (let i = 1; i <= count; i++) {
    const id = `cust:${i.toString().padStart(3, '0')}`;
    saveAnchor("customer", id, {
      id,
      name: `Customer ${i}`,
      region: regions[i % regions.length]
    });
    
    // Add some attached documents
    for (let j = 0; j < 5; j++) {
      attachToAnchor(id, "service-requests", {
        type: types[Math.floor(Math.random() * types.length)],
        created_at: new Date().toISOString(),
        status: statuses[Math.floor(Math.random() * statuses.length)]
      });
    }
  }
  
  console.log("Test data generation complete.");
}

async function runPerformanceTest() {
  console.log("=== FiberDB Cache Performance Test ===\n");
  
  // First, clear all caches to start fresh
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  // Generate test data
  await generateTestData(10);
  
  // Define test queries
  const queries = [
    {
      name: "Simple ID Lookup",
      query: {
        primary: "customer",
        id: "cust:001",
        include: ["name", "region"]
      }
    },
    {
      name: "Relationship Query",
      query: {
        primary: "customer",
        id: "cust:005",
        include: ["name", "region", "service-requests"]
      }
    },
    {
      name: "Filtered Query",
      query: {
        primary: "customer",
        include: ["name", "region", "service-requests"],
        where: {
          "service-requests.status": { eq: "closed" }
        }
      }
    }
  ];
  
  // Run each query multiple times with and without cache
  for (const testCase of queries) {
    console.log(`\n## Testing: ${testCase.name}`);
    
    // Clear caches before this test
    documentCache.clear();
    queryCache.clear();
    fileExistsCache.clear();
    
    // First run without cache
    console.log("\n1. First run (Cold - No Cache):");
    const [result1, time1] = measureTime(() => 
      runStructuredQuery({ ...testCase.query, skipCache: true })
    );
    console.log(`   Time: ${time1.toFixed(2)}ms`);
    console.log(`   Results: ${result1.length} records`);
    
    // Second run (document cache should help)
    console.log("\n2. Second run (Partial Cache):");
    const [result2, time2] = measureTime(() => 
      runStructuredQuery({ ...testCase.query, skipCache: true })
    );
    console.log(`   Time: ${time2.toFixed(2)}ms`);
    console.log(`   Results: ${result2.length} records`);
    console.log(`   Improvement: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
    
    // Run with full query caching
    console.log("\n3. Third run (Full Query Cache):");
    const fullCacheQuery = { ...testCase.query };
    const [result3, time3] = measureTime(() => 
      runStructuredQuery(fullCacheQuery)
    );
    console.log(`   Time: ${time3.toFixed(2)}ms`);
    console.log(`   Results: ${result3.length} records`);
    console.log(`   Improvement from first: ${((time1 - time3) / time1 * 100).toFixed(1)}%`);
    
    // Get cache stats
    const stats = getAllCacheStats();
    console.log("\nCache Stats:");
    console.log(JSON.stringify(stats, null, 2));
  }
  
  console.log("\n=== Test Complete ===");
}

// Run the performance test
runPerformanceTest();