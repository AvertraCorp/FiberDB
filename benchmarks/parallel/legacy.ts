// test-parallel-performance.ts - Compare sync and async query performance
import { runStructuredQuery } from "./core/query-fabric";
import { runStructuredQueryAsync } from "./core/query-async";
import { saveAnchor } from "./core/insert";
import { attachToAnchor } from "./core/insert";
import { documentCache, queryCache, fileExistsCache } from "./core/utils/cache";
import fs from "fs";

// Utility to format numbers with commas
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
  if (fs.existsSync("data")) {
    fs.rmSync("data", { recursive: true, force: true });
  }
  
  // Clear caches
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  const regions = ["NW", "SW", "NE", "SE", "MW"];
  const types = ["Billing Error", "Power Outage", "Service Request", "Maintenance"];
  const statuses = ["open", "closed", "pending", "in-progress"];
  
  // Create different customers
  for (let i = 1; i <= count; i++) {
    const id = `cust:${i.toString().padStart(3, '0')}`;
    saveAnchor("customer", id, {
      id,
      name: `Customer ${i}`,
      region: regions[i % regions.length]
    });
    
    // Add 5-10 random attached documents for each customer
    const docCount = 5 + Math.floor(Math.random() * 6);
    for (let j = 0; j < docCount; j++) {
      attachToAnchor(id, "service-requests", {
        type: types[Math.floor(Math.random() * types.length)],
        created_at: new Date().toISOString(),
        status: statuses[Math.floor(Math.random() * statuses.length)]
      });
    }
    
    // Add some chat messages
    const chatCount = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < chatCount; k++) {
      attachToAnchor(id, "chat", {
        message: `Message ${k + 1} from customer ${i}`,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  console.log(`Created ${count} customers with attachments.`);
}

async function runPerformanceTest() {
  console.log("=== FiberDB Parallel Processing Performance Test ===");
  
  // Generate test data - 200 customers with attachments
  await generateTestData(200);
  
  // Define test queries with increasing complexity
  const testQueries = [
    {
      name: "Simple ID Lookup (1 file)",
      query: {
        primary: "customer",
        id: "cust:001",
        include: ["name", "region"],
        skipCache: true
      }
    },
    {
      name: "Single Customer with Attachments (3-5 files)",
      query: {
        primary: "customer",
        id: "cust:025",
        include: ["name", "region", "chat", "service-requests"],
        skipCache: true
      }
    },
    {
      name: "All Customers (200 files)",
      query: {
        primary: "customer",
        include: ["name", "region"],
        skipCache: true
      }
    },
    {
      name: "All Customers with Attachments (600-800 files)",
      query: {
        primary: "customer",
        include: ["name", "region", "chat", "service-requests"],
        skipCache: true
      }
    },
    {
      name: "Filtered Customers with Status (600-800 files with filtering)",
      query: {
        primary: "customer",
        include: ["name", "region", "service-requests"],
        where: {
          "service-requests.status": { eq: "closed" }
        },
        skipCache: true
      }
    }
  ];
  
  // Run comparison for each query
  for (const test of testQueries) {
    console.log(`\n## Testing: ${test.name}`);
    
    // Clear caches
    documentCache.clear();
    queryCache.clear();
    fileExistsCache.clear();
    
    // Run synchronous query
    console.log("\n1. Running with synchronous implementation:");
    const [syncResult, syncTime] = await measureTime(() => 
      runStructuredQuery(test.query)
    );
    const recordCount = syncResult.length;
    let attachmentCount = 0;
    
    // Count attachments in results
    syncResult.forEach(record => {
      if (record["service-requests"]) {
        attachmentCount += record["service-requests"].length;
      }
      if (record["chat"]) {
        attachmentCount += record["chat"].length;
      }
    });
    
    console.log(`   Time: ${syncTime.toFixed(2)}ms`);
    console.log(`   Records: ${recordCount} customers, ${attachmentCount} attachments`);
    
    // Clear caches again for fair comparison
    documentCache.clear();
    queryCache.clear();
    fileExistsCache.clear();
    
    // Run asynchronous parallel query
    console.log("\n2. Running with asynchronous parallel implementation:");
    const [asyncResult, asyncTime] = await measureTime(() => 
      runStructuredQueryAsync(test.query)
    );
    
    console.log(`   Time: ${asyncTime.toFixed(2)}ms`);
    console.log(`   Records: ${asyncResult.length} customers, ${attachmentCount} attachments`);
    
    // Calculate improvement
    const improvement = ((syncTime - asyncTime) / syncTime * 100);
    console.log(`\n   Speed Improvement: ${improvement.toFixed(1)}%`);
    console.log(`   Sync: ${syncTime.toFixed(2)}ms vs Async: ${asyncTime.toFixed(2)}ms`);
  }
  
  console.log("\n=== Test Complete ===");
}

// Run the performance test
runPerformanceTest();