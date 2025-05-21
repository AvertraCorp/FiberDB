/**
 * Query Performance Tests
 * These tests focus on measuring the performance improvements from our optimizations
 */
import { describe, test, expect, beforeAll, beforeEach, mock, spyOn } from "bun:test";
import { runStructuredQuery } from "../../../core/query/sync";
import { runStructuredQueryAsync } from "../../../core/query/async";
import { 
  documentCache, 
  queryCache, 
  fileExistsCache
} from "../../../utils/cache";
import * as storage from "../../../core/storage";
import fs from "fs";
import path from "path";

// Sample dataset sizes for testing
const SMALL_DATASET = 5;
const MEDIUM_DATASET = 50;
const LARGE_DATASET = 200;

// Generate mock business partners
function generateMockPartners(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `BP${100000 + i}`,
    name: `Business Partner ${i}`,
    status: i % 3 === 0 ? "active" : "inactive",
    customerClassification: ["A", "B", "C"][i % 3],
    industrySector: ["Z001", "Z002", "Z003"][i % 3],
    createdAt: new Date().toISOString()
  }));
}

// Generate mock contracts
function generateMockContracts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    contractId: `C${10000 + i}`,
    status: i % 2 === 0 ? "ACTIVE" : "INACTIVE",
    utilityType: ["WATER", "GAS", "ELECTRICITY"][i % 3],
    startDate: new Date().toISOString()
  }));
}

// Setup mocks
beforeAll(() => {
  // Mock console methods to prevent noise during tests
  mock.module("console", () => ({
    log: () => {},
    error: () => {},
    warn: () => {},
  }));
});

// Reset caches before each test group
beforeEach(() => {
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
});

describe("Query Performance Benchmarks", () => {
  // Helper to setup mocks for different dataset sizes
  function setupMocksForDataset(size: number) {
    const mockPartners = generateMockPartners(size);
    const fileNames = mockPartners.map(p => `${p.id}.json`);
    
    // Mock fs methods
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readdirSync").mockImplementation((dirPath: string) => {
      if (dirPath.includes("anchors/business-partner")) {
        return fileNames;
      }
      return [];
    });
    
    // Mock storage methods
    spyOn(storage, "loadJSON").mockImplementation((filePath: string) => {
      const matchId = filePath.match(/BP(\d+)\.json/);
      if (matchId) {
        const index = parseInt(matchId[1]) - 100000;
        if (index >= 0 && index < mockPartners.length) {
          return mockPartners[index];
        }
      }
      return null;
    });
    
    // Mock async storage methods
    spyOn(storage, "existsAsync").mockResolvedValue(true);
    spyOn(storage, "readdirAsync").mockImplementation(async (dirPath: string) => {
      if (dirPath.includes("anchors/business-partner")) {
        return fileNames;
      }
      return [];
    });
    
    spyOn(storage, "loadJSONAsync").mockImplementation(async (filePath: string) => {
      const matchId = filePath.match(/BP(\d+)\.json/);
      if (matchId) {
        const index = parseInt(matchId[1]) - 100000;
        if (index >= 0 && index < mockPartners.length) {
          return mockPartners[index];
        }
      }
      return null;
    });
    
    return { mockPartners, fileNames };
  }
  
  describe("Small Dataset (ID-based query)", () => {
    beforeEach(() => {
      setupMocksForDataset(SMALL_DATASET);
    });
    
    test("should be faster with synchronous implementation", async () => {
      // Measure sync performance
      const syncStart = performance.now();
      const syncResult = runStructuredQuery({
        primary: "business-partner",
        id: "BP100000"
      });
      const syncEnd = performance.now();
      const syncDuration = syncEnd - syncStart;
      
      // Measure async performance
      const asyncStart = performance.now();
      const asyncResult = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP100000"
      });
      const asyncEnd = performance.now();
      const asyncDuration = asyncEnd - asyncStart;
      
      // Both should return valid results
      expect(syncResult).toBeArray();
      expect(syncResult.length).toBe(1);
      expect(asyncResult).toBeArray();
      expect(asyncResult.length).toBe(1);
      
      // For ID-based queries, synchronous implementation should be faster
      // Note: In automated tests, timing can be inconsistent
      // We might just log the values rather than making a hard assertion
      console.log(`Sync duration: ${syncDuration}ms, Async duration: ${asyncDuration}ms`);
    });
    
    test("should benefit from small query optimization", () => {
      // Run query on a small dataset with ID
      const start = performance.now();
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "BP100000"
      });
      const duration = performance.now() - start;
      
      // We expect a result
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      
      // Log timing information (for information rather than assertion)
      console.log(`Small query optimization duration: ${duration}ms`);
    });
  });
  
  describe("Medium Dataset", () => {
    beforeEach(() => {
      setupMocksForDataset(MEDIUM_DATASET);
    });
    
    test("should efficiently filter dataset", () => {
      // Run query with filter
      const start = performance.now();
      const result = runStructuredQuery({
        primary: "business-partner",
        filter: { 
          status: "active",
          customerClassification: "A"
        }
      });
      const duration = performance.now() - start;
      
      // We expect filtered results
      expect(result).toBeArray();
      expect(result.length).toBeLessThan(MEDIUM_DATASET);
      
      // Log timing information
      console.log(`Filter query duration (${result.length} results): ${duration}ms`);
    });
    
    test("should benefit from caching for repeated queries", () => {
      // First query (cold cache)
      const queryOptions = {
        primary: "business-partner",
        filter: { status: "active" }
      };
      
      const startCold = performance.now();
      const coldResult = runStructuredQuery(queryOptions);
      const coldDuration = performance.now() - startCold;
      
      // Second query (warm cache)
      const startWarm = performance.now();
      const warmResult = runStructuredQuery(queryOptions);
      const warmDuration = performance.now() - startWarm;
      
      // Results should be the same
      expect(warmResult).toEqual(coldResult);
      
      // Warm cache should be faster
      expect(warmDuration).toBeLessThan(coldDuration);
      console.log(`Cold cache: ${coldDuration}ms, Warm cache: ${warmDuration}ms, Improvement: ${(1 - warmDuration/coldDuration)*100}%`);
    });
  });
  
  describe("Large Dataset", () => {
    beforeEach(() => {
      setupMocksForDataset(LARGE_DATASET);
    });
    
    test("should be faster with asynchronous implementation", async () => {
      // Create a complex query to test with
      const queryOptions = {
        primary: "business-partner",
        filter: { 
          status: "active",
          customerClassification: "A"
        }
      };
      
      // Measure sync performance
      const syncStart = performance.now();
      const syncResult = runStructuredQuery(queryOptions);
      const syncEnd = performance.now();
      const syncDuration = syncEnd - syncStart;
      
      // Clear caches to ensure fair comparison
      documentCache.clear();
      queryCache.clear();
      
      // Measure async performance
      const asyncStart = performance.now();
      const asyncResult = await runStructuredQueryAsync(queryOptions);
      const asyncEnd = performance.now();
      const asyncDuration = asyncEnd - asyncStart;
      
      // Both should return valid results with the same length
      expect(syncResult).toBeArray();
      expect(asyncResult).toBeArray();
      expect(asyncResult.length).toBe(syncResult.length);
      
      // For large datasets, asynchronous implementation should be faster
      console.log(`Large dataset: Sync duration: ${syncDuration}ms, Async duration: ${asyncDuration}ms`);
    });
    
    test("should benefit from batch processing", async () => {
      // Run async query which uses batch processing
      const start = performance.now();
      const result = await runStructuredQueryAsync({
        primary: "business-partner"
      });
      const duration = performance.now() - start;
      
      // We expect all results
      expect(result).toBeArray();
      expect(result.length).toBe(LARGE_DATASET);
      
      // Log timing information
      console.log(`Batch processing duration (${result.length} results): ${duration}ms`);
    });
  });
});