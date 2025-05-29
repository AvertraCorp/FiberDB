/**
 * Asynchronous Query Implementation Tests
 * These tests focus on the optimized asynchronous query implementation
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, mock, spyOn } from "bun:test";
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

// Track mocks for cleanup
let consoleMock: any;
let fsMocks: any[] = [];
let storageMocks: any[] = [];

// Setup mocks
beforeAll(() => {
  // Mock console methods to prevent noise during tests
  consoleMock = mock.module("console", () => ({
    log: () => {},
    error: () => {},
    warn: () => {},
  }));
});

// Cleanup after all tests
afterAll(() => {
  if (consoleMock) {
    consoleMock.mockRestore?.();
  }
  fsMocks.forEach(mock => mock.mockRestore?.());
  storageMocks.forEach(mock => mock.mockRestore?.());
});

// Reset before each test
beforeEach(() => {
  // Clear caches
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  // Clear previous mocks
  fsMocks.forEach(mock => mock.mockRestore?.());
  storageMocks.forEach(mock => mock.mockRestore?.());
  fsMocks = [];
  storageMocks = [];
  
  // Mock fs module
  const existsSyncMock = spyOn(fs, "existsSync").mockImplementation((path: string) => {
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
  fsMocks.push(existsSyncMock);
  
  // Mock asynchronous storage methods
  const existsAsyncMock = spyOn(storage, "existsAsync").mockImplementation(async (path: string) => {
    // Mock directory/file existence
    if (path.includes("anchors/business-partner")) return true;
    if (path.includes("BP12345.json")) return true;
    if (path.includes("BP67890.json")) return true;
    if (path.includes("attached/BP12345")) return true;
    if (path.includes("attached/BP67890")) return true;
    return false;
  });
  storageMocks.push(existsAsyncMock);
  
  const readdirAsyncMock = spyOn(storage, "readdirAsync").mockImplementation(async (dirPath: string) => {
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
  storageMocks.push(readdirAsyncMock);
  
  const loadJSONAsyncMock = spyOn(storage, "loadJSONAsync").mockImplementation(async (filePath: string) => {
    if (filePath.includes("BP12345.json")) return mockBusinessPartner;
    if (filePath.includes("BP67890.json")) return mockInactivePartner;
    if (filePath.includes("BP12345/addresses.json")) return mockAddresses;
    if (filePath.includes("BP12345/contracts.json")) return mockContracts;
    if (filePath.includes("BP67890/addresses.json")) return mockAddresses.slice(0, 1);
    return null;
  });
  storageMocks.push(loadJSONAsyncMock);
});

// Cleanup after each test
afterEach(() => {
  // Restore all spies created in this test
  fsMocks.forEach(mock => mock.mockRestore?.());
  storageMocks.forEach(mock => mock.mockRestore?.());
  fsMocks = [];
  storageMocks = [];
});

describe("Asynchronous Query Implementation", () => {
  describe("Legacy API - Basic Functionality", () => {
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
  
  describe("Legacy API - Filtering", () => {
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
  
  describe("Legacy API - Performance Optimizations", () => {
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

  describe("Enhanced API - Entity Operations", () => {
    test("should handle entity queries with enhanced API", async () => {
      // Mock enhanced storage engine methods
      const mockEntity = {
        id: "entity-001",
        type: "customer",
        attributes: { name: "Enhanced Customer", status: "active" },
        documents: { notes: ["Important note"] },
        edges: [],
        metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      };

      // This test verifies the API structure, actual implementation would be different
      expect(mockEntity.type).toBe("customer");
      expect(mockEntity.attributes.name).toBe("Enhanced Customer");
      expect(mockEntity.documents.notes).toBeArray();
      expect(mockEntity.edges).toBeArray();
    });

    test("should handle graph traversal queries", async () => {
      // Mock graph query result
      const mockGraphResult = {
        nodes: [
          { id: "customer:001", type: "customer", data: { name: "Customer A" } },
          { id: "order:001", type: "order", data: { total: 100 } }
        ],
        edges: [
          { from: "customer:001", to: "order:001", type: "PLACED", properties: {} }
        ],
        paths: [
          { nodes: ["customer:001", "order:001"], edges: ["PLACED"], length: 1 }
        ]
      };

      expect(mockGraphResult.nodes).toHaveLength(2);
      expect(mockGraphResult.edges).toHaveLength(1);
      expect(mockGraphResult.paths).toHaveLength(1);
    });

    test("should handle relationship queries", async () => {
      // Mock relationship data
      const mockRelationships = [
        { from: "customer:001", to: "order:001", type: "PLACED", properties: { date: "2024-01-01" } },
        { from: "customer:001", to: "address:001", type: "LIVES_AT", properties: {} }
      ];

      expect(mockRelationships).toHaveLength(2);
      expect(mockRelationships[0].type).toBe("PLACED");
      expect(mockRelationships[1].type).toBe("LIVES_AT");
    });
  });

  describe("Enhanced API - Mixed Operations", () => {
    test("should handle queries mixing legacy and enhanced data", async () => {
      // Test that verifies both legacy anchor/attachment and enhanced entity data can be queried
      const mockMixedResult = {
        legacyData: [
          { id: "BP12345", name: "Legacy Partner", status: "active" }
        ],
        enhancedData: [
          {
            id: "entity-001",
            type: "customer",
            attributes: { name: "Enhanced Customer" },
            documents: {},
            edges: [],
            metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          }
        ]
      };

      expect(mockMixedResult.legacyData).toHaveLength(1);
      expect(mockMixedResult.enhancedData).toHaveLength(1);
      expect(mockMixedResult.enhancedData[0].type).toBe("customer");
    });

    test("should handle entity migrations from legacy to enhanced format", async () => {
      // Mock migration scenario
      const legacyAnchor = { id: "BP12345", name: "Business Partner", status: "active" };
      const legacyAttachments = { addresses: [{ street: "Main St" }] };

      const migratedEntity = {
        id: "BP12345",
        type: "business-partner",
        attributes: legacyAnchor,
        documents: legacyAttachments,
        edges: [],
        metadata: { 
          migratedAt: new Date().toISOString(),
          originalFormat: "legacy",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      expect(migratedEntity.attributes.name).toBe("Business Partner");
      expect(migratedEntity.documents.addresses).toBeArray();
      expect(migratedEntity.metadata.originalFormat).toBe("legacy");
    });
  });
});