declare global {
  var validBpId: string;
}

/**
 * FiberDB Query Examples
 * 
 * This file contains comprehensive examples of all query types and performance
 * optimizations available in FiberDB. Use these examples as a reference for
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
import { query, runStructuredQuery, runStructuredQueryAsync } from "../core/query";
import config from "../config";
import fs from "fs";
import path from "path";

// Optional: Configure performance settings
config.performance.defaultParallel = true;  // Enable parallel processing by default
config.performance.logMetrics = true;       // Log performance metrics to console

/**
 * Basic Query Examples
 */
async function basicQueryExamples() {
  console.log("=== Basic Query Examples ===");

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
    console.log("Single entity query result:", singleEntityResult);
    
    // Print data from file directly for debugging
    console.log("\nDebug: Reading file directly: ");
    const filePath = path.join("data", "anchors", "business-partner", `${validBpId}.json`);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      console.log(fileContent);
    }
  } catch (error) {
    console.error("Error in ID query:", error);
  }

  // Query all entities of a type
  const allEntitiesResult = await query({
    primary: "business-partner",
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("All entities query result count:", allEntitiesResult.length);

  // Select specific fields
  const selectedFieldsResult = await query({
    primary: "business-partner",
    id: global.validBpId || validBpId,
    include: ["id", "firstName", "lastName", "customerClassification", "industrySector"],
    skipTTL: true, // Skip TTL filtering for historical data
    useParallel: false // Use synchronous mode for ID queries
  });
  console.log("Selected fields query result:", selectedFieldsResult);

  // Include all fields with wildcard
  const wildcardFieldsResult = await query({
    primary: "business-partner",
    id: global.validBpId || validBpId,
    include: ["*"],
    skipTTL: true, // Skip TTL filtering for historical data
    useParallel: false // Use synchronous mode for ID queries
  });
  console.log("Wildcard fields query result:", wildcardFieldsResult);

  // Include specific attachments
  const specificAttachmentsResult = await query({
    primary: "business-partner",
    id: global.validBpId || validBpId,
    include: ["id", "firstName", "lastName", "customerClassification", "addresses", "contracts"],
    skipTTL: true, // Skip TTL filtering for historical data
    useParallel: false // Use synchronous mode for ID queries
  });
  console.log("Specific attachments query result:", specificAttachmentsResult);
  
  // Demonstrate accessing attached data with proper structure handling
  if (specificAttachmentsResult.length > 0 && specificAttachmentsResult[0].addresses) {
    console.log("\nAddresses data example:");
    console.log("Number of addresses:", specificAttachmentsResult[0].addresses.length);
    console.log("First address details:", specificAttachmentsResult[0].addresses[0]);
  }
}

/**
 * Filtering Examples
 */
async function filteringExamples() {
  console.log("\n=== Filtering Examples ===");

  // Basic equality filter on primary entity
  const equalityFilterResult = await query({
    primary: "business-partner",
    filter: { customerClassification: "B" },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Equality filter result count:", equalityFilterResult.length);

  // Multiple equality filters (AND logic)
  const multipleFilterResult = await query({
    primary: "business-partner",
    filter: { 
      customerClassification: "B",
      industryKey: "TECH"
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Multiple filter result count:", multipleFilterResult.length);

  // Filter on attached documents
  const attachmentFilterResult = await query({
    primary: "business-partner",
    include: ["id", "organizationName", "customerClassification", "addresses"],
    where: { 
      "addresses.country": "LB" 
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Attachment filter result count:", attachmentFilterResult.length);
  
  if (attachmentFilterResult.length > 0) {
    console.log("First filtered result:", {
      id: attachmentFilterResult[0].id,
      organizationName: attachmentFilterResult[0].organizationName,
      addressesCount: attachmentFilterResult[0].addresses?.length || 0
    });
  }

  // Combined primary and attachment filters
  const combinedFilterResult = await query({
    primary: "business-partner",
    filter: { 
      customerClassification: "B" 
    },
    include: ["id", "organizationName", "customerClassification", "contracts"],
    where: { 
      "contracts.status": "ACTIVE",
      "contracts.utilityType": "WATER"
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Combined filter result count:", combinedFilterResult.length);
}

/**
 * Advanced Filtering with Operators
 */
async function advancedFilteringExamples() {
  console.log("\n=== Advanced Filtering Examples ===");

  // Equality operator (eq)
  const equalityOpResult = await query({
    primary: "business-partner",
    filter: { 
      customerClassification: { eq: "B" } 
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Equality operator result count:", equalityOpResult.length);

  // Not Equal operator (ne)
  const notEqualOpResult = await query({
    primary: "business-partner",
    filter: { 
      customerClassification: { ne: "A" } 
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Not Equal operator result count:", notEqualOpResult.length);

  // Contains operator for text search in organization name
  const containsOpResult = await query({
    primary: "business-partner",
    filter: {
      organizationName: { contains: "Inc" }
    },
    include: ["id", "organizationName", "customerClassification"],
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Contains operator result count:", containsOpResult.length);

  // In operator (value in array)
  const inOpResult = await query({
    primary: "business-partner",
    filter: { 
      customerClassification: { in: ["A", "B", "C"] } 
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("In operator result count:", inOpResult.length);

  // Combined operators
  const combinedOpResult = await query({
    primary: "business-partner",
    filter: { 
      customerClassification: { in: ["A", "B"] },
      industryKey: { ne: "AUTO" }
    },
    include: ["id", "organizationName", "customerClassification", "contracts"],
    where: { 
      "contracts.status": { eq: "ACTIVE" }
    },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Combined operators result count:", combinedOpResult.length);
}

/**
 * Security & Encryption Examples
 */
async function securityExamples(validBpId: string) {
  console.log("\n=== Security & Encryption Examples ===");

  // Query without decryption key (secure fields are not returned)
  const encryptedResult = await query({
    primary: "business-partner",
    id: validBpId,
    include: ["id", "organizationName", "customerClassification", "__secure"],
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Query without decryption key:", encryptedResult);

  // With decryption key, you would get secure fields (not populated in this demo)
  const decryptedResult = await query({
    primary: "business-partner",
    id: validBpId,
    include: ["id", "organizationName", "customerClassification", "__secure"],
    decryptionKey: "encryption-key", // In a real system, this would decrypt secure fields
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Query with decryption key:", decryptedResult);
}

/**
 * Performance Optimization Examples
 */
async function performanceExamples(validBpId: string) {
  console.log("\n=== Performance Optimization Examples ===");

  // Standard query (uses cache if available)
  console.time("Standard Query");
  const standardResult = await query({
    primary: "business-partner",
    filter: { customerClassification: "B" },
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.timeEnd("Standard Query");
  console.log("Standard query result count:", standardResult.length);

  // Force fresh data by skipping cache
  console.time("Skip Cache Query");
  const freshResult = await query({
    primary: "business-partner",
    filter: { customerClassification: "B" },
    skipCache: true,
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.timeEnd("Skip Cache Query");
  console.log("Fresh query result count:", freshResult.length);
  
  // Skip TTL filtering (show historical data)
  console.time("Historical Data Query");
  const historicalResult = await query({
    primary: "business-partner",
    id: validBpId,
    include: ["id", "organizationName", "addresses"],
    skipTTL: true
  });
  console.timeEnd("Historical Data Query");
  console.log("Historical data query result count:", historicalResult.length);
  
  if (historicalResult.length > 0 && historicalResult[0].addresses) {
    console.log("Historical address count:", historicalResult[0].addresses.length);
  }

  // Explicitly enable parallel processing for large datasets
  console.time("Parallel Query");
  const parallelResult = await query({
    primary: "business-partner",
    filter: { customerClassification: "B" },
    useParallel: true,
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.timeEnd("Parallel Query");
  console.log("Parallel query result count:", parallelResult.length);

  // Disable parallel processing for small datasets
  console.time("Synchronous Query");
  const syncResult = await query({
    primary: "business-partner",
    id: validBpId,
    include: ["id", "firstName", "lastName"],
    useParallel: false,
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.timeEnd("Synchronous Query");
  console.log("Synchronous query result count:", syncResult.length);

  // Use indexing for faster lookups
  console.time("Indexed Query");
  const indexedResult = await query({
    primary: "business-partner",
    filter: { industryKey: "TECH" },
    useIndexes: true,
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.timeEnd("Indexed Query");
  console.log("Indexed query result count:", indexedResult.length);

  // Disable indexing (fallback to direct file scanning)
  console.time("Non-Indexed Query");
  const nonIndexedResult = await query({
    primary: "business-partner",
    filter: { industryKey: "TECH" },
    useIndexes: false,
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.timeEnd("Non-Indexed Query");
  console.log("Non-indexed query result count:", nonIndexedResult.length);
}

/**
 * Performance Metrics Examples
 */
async function metricsExamples() {
  console.log("\n=== Performance Metrics Examples ===");

  // Query with performance metrics
  const resultWithMetrics = await query({
    primary: "business-partner",
    filter: { customerClassification: "B" },
    include: ["id", "organizationName", "customerClassification", "contracts"],
    where: { "contracts.status": "ACTIVE" },
    includePerformanceMetrics: true,
    skipTTL: true // Skip TTL filtering for historical data
  });

  // Access metrics from the first result
  if (resultWithMetrics.length > 0) {
    const metrics = resultWithMetrics[0].__metrics;
    console.log("Performance metrics:", metrics);
    
    // Extract specific metrics
    console.log("Query duration:", metrics.duration, "ms");
    console.log("Cache hit:", metrics.details?.queryCacheHit);
    console.log("Files processed:", metrics.details?.recordsStats?.processed);
    console.log("Records returned:", metrics.details?.recordsStats?.returned);
    
    // Phase timings
    console.log("Cache check time:", metrics.phases?.cacheCheck?.duration, "ms");
    console.log("Find files time:", metrics.phases?.findFiles?.duration, "ms");
    console.log("Process files time:", metrics.phases?.processFiles?.duration, "ms");
    
    // Index usage
    console.log("Used indexes:", metrics.details?.usedPrimaryIndexes);
  }
}

/**
 * API Usage Examples (for reference when using HTTP API)
 */
function apiExamples() {
  console.log("\n=== API Request Examples ===");

  // Standard query
  console.log("Standard query API request:");
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
      "decryptionKey": "encryption-key",
      "skipTTL": true
    }'
  `);

  // With performance metrics header
  console.log("\nQuery with performance metrics API request:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/query \\
    -H "Content-Type: application/json" \\
    -H "X-Include-Performance-Metrics: true" \\
    -d '{
      "primary": "business-partner",
      "filter": { "customerClassification": "A" },
      "skipTTL": true
    }'
  `);

  // Skip cache header
  console.log("\nSkip cache API request:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/query \\
    -H "Content-Type: application/json" \\
    -H "X-Skip-Cache: true" \\
    -d '{
      "primary": "business-partner",
      "id": "BP12345678",
      "skipTTL": true
    }'
  `);

  // Use parallel processing header
  console.log("\nParallel processing API request:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/query \\
    -H "Content-Type: application/json" \\
    -H "X-Use-Parallel: true" \\
    -d '{
      "primary": "business-partner",
      "skipTTL": true
    }'
  `);

  // Skip TTL header
  console.log("\nHistorical data API request:");
  console.log(`
  curl -X POST http://localhost:${config.server.port}/query \\
    -H "Content-Type: application/json" \\
    -H "X-Skip-TTL: true" \\
    -d '{
      "primary": "business-partner",
      "id": "<A-VALID-BP-ID>",
      "include": ["id", "organizationName", "addresses"]
    }'
  `);

  // Cache management API
  console.log("\nGet cache statistics:");
  console.log(`curl -X GET http://localhost:${config.server.port}/cache`);

  console.log("\nClear all caches:");
  console.log(`curl -X DELETE http://localhost:${config.server.port}/cache`);
}

/**
 * Direct Query Engine Usage Examples
 * (For advanced use cases or internal application usage)
 */
async function directEngineExamples(validBpId: string) {
  console.log("\n=== Direct Query Engine Usage ===");

  // Use synchronous query engine directly
  console.log("Using synchronous query engine directly:");
  const syncEngineResult = runStructuredQuery({
    primary: "business-partner",
    id: validBpId,
    include: ["id", "firstName", "lastName"],
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Sync engine result:", syncEngineResult);

  // Use asynchronous query engine directly
  console.log("Using asynchronous query engine directly:");
  const asyncEngineResult = await runStructuredQueryAsync({
    primary: "business-partner",
    id: validBpId,
    include: ["id", "firstName", "lastName"],
    skipTTL: true // Skip TTL filtering for historical data
  });
  console.log("Async engine result:", asyncEngineResult);
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  // Add debugging for directory paths
  
  console.log("Running FiberDB Query Examples\n");
  
  // Import modules
  const fs = await import("fs");
  const path = await import("path");
  
  // Check config
  console.log("Config baseDir:", config.storage.baseDir);
  
  // Check business-partner directory
  const anchorPath = path.join(config.storage.baseDir, 'anchors', 'business-partner');
  console.log("Business partner directory path:", anchorPath);
  console.log("Directory exists:", fs.existsSync(anchorPath));
  
  if (fs.existsSync(anchorPath)) {
    try {
      const files = fs.readdirSync(anchorPath);
      console.log("Number of files in directory:", files.length);
    } catch (error) {
      console.error("Error reading directory:", error);
    }
  }
  
  // Get a valid business partner ID for all examples
  const bpDir = path.join("data", "anchors", "business-partner");
  const validBusinessPartners = fs.existsSync(bpDir) ? fs.readdirSync(bpDir) : [];
  const validBpId = validBusinessPartners.length > 0 
    ? validBusinessPartners[0]!.replace(".json", "") 
    : "BP01400152"; // Fallback

  // Make it available globally so each example function can use it
  global.validBpId = validBpId;
  console.log("Using valid business partner ID for all examples:", validBpId);

  await basicQueryExamples();
  await filteringExamples();
  await advancedFilteringExamples();
  await securityExamples(validBpId);
  await performanceExamples(validBpId);
  await metricsExamples();
  apiExamples();
  await directEngineExamples(validBpId);
  
  console.log("\nAll examples completed!");
}

// Execute examples when run directly
if (import.meta.main) {
  runAllExamples()
    .catch(err => {
      console.error("Error running examples:", err);
    });
}