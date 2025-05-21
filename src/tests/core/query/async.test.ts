/**
 * Asynchronous Query Implementation Tests
 * These tests focus on the optimized asynchronous query implementation
 */
import { describe, test, expect, beforeAll, beforeEach, mock, spyOn } from "bun:test";
import { runStructuredQueryAsync } from "../../../core/query/async";
import { 
  documentCache, 
  queryCache, 
  fileExistsCache, 
  getDocumentCacheKey,
  getAttachedCacheKey
} from "../../../utils/cache";
import * as storage from "../../../core/storage";
import fs from "fs";
import path from "path";

// Mock data for testing
const mockBusinessPartner = {
  id: "BP12345",
  name: "Test Partner",
  status: "active",
  customerClassification: "A",
  industrySector: "Z002",
  createdAt: new Date().toISOString()
};

const mockInactivePartner = {
  id: "BP67890",
  name: "Inactive Partner",
  status: "inactive",
  customerClassification: "B",
  industrySector: "Z001",
  createdAt: new Date().toISOString()
};

const mockAddresses = [
  { id: "addr1", street: "Main St", city: "Test City", country: "US" },
  { id: "addr2", street: "Second St", city: "Another City", country: "CA" }
];

const mockContracts = [
  { contractId: "C001", status: "ACTIVE", utilityType: "WATER" },
  { contractId: "C002", status: "INACTIVE", utilityType: "GAS" }
];

// Setup mocks
beforeAll(() => {
  // Mock console methods to prevent noise during tests
  mock.module("console", () => ({
    log: () => {},
    error: () => {},
    warn: () => {},
  }));
});

// Reset before each test
beforeEach(() => {
  // Clear caches
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  // Mock fs module
  spyOn(fs, "existsSync").mockImplementation((path: string) => {
    // Mock directory/file existence
    if (path.includes("anchors/business-partner")) return true;
    if (path.includes("BP12345.json")) return true;
    if (path.includes("BP67890.json")) return true;
    if (path.includes("attached/BP12345")) return true;
    if (path.includes("attached/BP67890")) return true;
    if (path.includes("BP12345/addresses.json")) return true;
    if (path.includes("BP12345/contracts.json")) return true;
    if (path.includes("BP67890/addresses.json")) return true;
    return false;
  });
  
  // Mock asynchronous storage methods
  spyOn(storage, "existsAsync").mockImplementation(async (path: string) => {
    // Mock directory/file existence
    if (path.includes("anchors/business-partner")) return true;
    if (path.includes("BP12345.json")) return true;
    if (path.includes("BP67890.json")) return true;
    if (path.includes("attached/BP12345")) return true;
    if (path.includes("attached/BP67890")) return true;
    return false;
  });
  
  spyOn(storage, "readdirAsync").mockImplementation(async (dirPath: string) => {
    if (dirPath.includes("anchors/business-partner")) {
      return ["BP12345.json", "BP67890.json"];
    }
    if (dirPath.includes("attached/BP12345")) {
      return ["addresses.json", "contracts.json"];
    }
    if (dirPath.includes("attached/BP67890")) {
      return ["addresses.json"];
    }
    return [];
  });
  
  spyOn(storage, "loadJSONAsync").mockImplementation(async (filePath: string) => {
    if (filePath.includes("BP12345.json")) return mockBusinessPartner;
    if (filePath.includes("BP67890.json")) return mockInactivePartner;
    if (filePath.includes("BP12345/addresses.json")) return mockAddresses;
    if (filePath.includes("BP12345/contracts.json")) return mockContracts;
    if (filePath.includes("BP67890/addresses.json")) return mockAddresses.slice(0, 1);
    return null;
  });
});

describe("Asynchronous Query Implementation", () => {
  describe("Basic Functionality", () => {
    test("should return all entities when no filtering is applied", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0].id).toBe("BP12345");
      expect(result[1].id).toBe("BP67890");
    });
    
    test("should handle empty results gracefully", async () => {
      // Override the mock to return no files
      spyOn(storage, "readdirAsync").mockImplementation(async () => []);
      
      const result = await runStructuredQueryAsync({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });
    
    test("should handle ID-based queries efficiently", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should handle non-existent ID gracefully", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "NONEXISTENT"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });
    
    test("should include attached data when requested", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345",
        include: ["id", "name", "addresses", "contracts"]
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
      expect(result[0]).toHaveProperty("addresses");
      expect(result[0]).toHaveProperty("contracts");
    });
    
    test("should only include requested fields", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345",
        include: ["id", "name"]
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
      expect(result[0].name).toBe("Test Partner");
      expect(result[0].status).toBeUndefined();
      expect(result[0].addresses).toBeUndefined();
    });
  });
  
  describe("Filtering", () => {
    test("should filter records based on simple criteria", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        filter: { status: "active" }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should filter based on multiple criteria (AND logic)", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        filter: { 
          status: "active",
          customerClassification: "A"
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should filter with advanced operators", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        filter: { 
          customerClassification: { in: ["A", "C"] }
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should filter based on attached data (where condition)", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        where: { 
          "addresses.country": "US"
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2); // Both entities have US addresses
    });
    
    test("should combine primary and attached filters", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        filter: { status: "active" },
        where: { 
          "contracts.status": "ACTIVE"
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
  });
  
  describe("Performance Optimizations", () => {
    test("should process batches for large datasets", async () => {
      // Create a mock with many files
      const manyFiles = Array.from({ length: 100 }, (_, i) => `BP${100000 + i}.json`);
      spyOn(storage, "readdirAsync").mockImplementation(async (dirPath: string) => {
        if (dirPath.includes("anchors/business-partner")) {
          return manyFiles;
        }
        return [];
      });
      
      // Return null for all loadJSONAsync calls to simplify the test
      spyOn(storage, "loadJSONAsync").mockImplementation(async () => null);
      
      const result = await runStructuredQueryAsync({
        primary: "business-partner"
      });
      
      // Since all loadJSONAsync calls return null, we expect 0 results
      // but the important part is that the function completes without error
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });
    
    test("should process files in parallel", async () => {
      // Create a spy to track multiple concurrent loadJSONAsync calls
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;
      
      spyOn(storage, "loadJSONAsync").mockImplementation(async (filePath: string) => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        
        concurrentCalls--;
        
        // Return appropriate mock data
        if (filePath.includes("BP12345.json")) return mockBusinessPartner;
        if (filePath.includes("BP67890.json")) return mockInactivePartner;
        return null;
      });
      
      // Create more files to test with
      const manyFiles = Array.from({ length: 10 }, (_, i) => `BP${100000 + i}.json`);
      spyOn(storage, "readdirAsync").mockImplementation(async (dirPath: string) => {
        if (dirPath.includes("anchors/business-partner")) {
          return manyFiles;
        }
        return [];
      });
      
      // Run query
      await runStructuredQueryAsync({
        primary: "business-partner"
      });
      
      // We should have had multiple concurrent calls
      // Note: This assumes batch size is at least 2, which it should be for any
      // reasonable implementation (our optimized version uses 50)
      expect(maxConcurrentCalls).toBeGreaterThan(1);
    });
    
    test("should cache document results for better performance", async () => {
      // Run first query to populate cache
      await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345"
      });
      
      // Clear loadJSONAsync spy and set up a new spy for verification
      const loadJSONSpy = spyOn(storage, "loadJSONAsync").mockClear();
      
      // Run second query (should use cache)
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
      
      // Verify loadJSONAsync was not called for the main entity
      const mainEntityCalls = loadJSONSpy.mock.calls.filter(call => 
        call[0].includes("BP12345.json")
      );
      expect(mainEntityCalls.length).toBe(0);
    });
    
    test("should respect skipCache parameter", async () => {
      // Run first query to populate cache
      await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345"
      });
      
      // Clear the spy
      const loadJSONSpy = spyOn(storage, "loadJSONAsync").mockClear();
      
      // Run second query with skipCache
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345",
        skipCache: true
      });
      
      // Verify loadJSONAsync was called despite the cache being populated
      expect(loadJSONSpy).toHaveBeenCalled();
    });
    
    test("should use query result cache for identical queries", async () => {
      // Define query options
      const queryOptions = {
        primary: "business-partner",
        filter: { status: "active" }
      };
      
      // Run first query
      const firstResult = await runStructuredQueryAsync(queryOptions);
      
      // Clear spies
      spyOn(storage, "loadJSONAsync").mockClear();
      spyOn(storage, "readdirAsync").mockClear();
      
      // Run second query with same options
      const secondResult = await runStructuredQueryAsync(queryOptions);
      
      // Results should match without accessing filesystem
      expect(secondResult).toEqual(firstResult);
      expect(storage.loadJSONAsync).not.toHaveBeenCalled();
      expect(storage.readdirAsync).not.toHaveBeenCalled();
    });
  });
});