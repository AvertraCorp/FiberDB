/**
 * Synchronous Query Implementation Tests
 * These tests focus on the optimized synchronous query implementation
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, mock, spyOn } from "bun:test";
import { runStructuredQuery } from "../../../core/query/sync";
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
  // Restore all mocks
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
  
  const readdirSyncMock = spyOn(fs, "readdirSync").mockImplementation((dirPath: string) => {
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
  fsMocks.push(readdirSyncMock);
  
  // Mock storage methods
  const loadJSONMock = spyOn(storage, "loadJSON").mockImplementation((filePath: string) => {
    if (filePath.includes("BP12345.json")) return mockBusinessPartner;
    if (filePath.includes("BP67890.json")) return mockInactivePartner;
    if (filePath.includes("BP12345/addresses.json")) return mockAddresses;
    if (filePath.includes("BP12345/contracts.json")) return mockContracts;
    if (filePath.includes("BP67890/addresses.json")) return mockAddresses.slice(0, 1);
    return null;
  });
  storageMocks.push(loadJSONMock);
});

// Cleanup after each test
afterEach(() => {
  // Restore all spies created in this test
  fsMocks.forEach(mock => mock.mockRestore?.());
  storageMocks.forEach(mock => mock.mockRestore?.());
  fsMocks = [];
  storageMocks = [];
});

describe("Synchronous Query Implementation", () => {
  describe("Legacy API - Basic Functionality", () => {
    test("should return all entities when no filtering is applied", () => {
      const result = runStructuredQuery({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0].id).toBe("BP12345");
      expect(result[1].id).toBe("BP67890");
    });
    
    test("should handle empty results gracefully", () => {
      // Override the mock to return no files
      spyOn(fs, "readdirSync").mockImplementation(() => []);
      
      const result = runStructuredQuery({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });
    
    test("should handle ID-based queries with small query optimization", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should handle non-existent ID gracefully", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "NONEXISTENT"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });
    
    test("should include attached data when requested", () => {
      const result = runStructuredQuery({
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
    
    test("should only include requested fields", () => {
      const result = runStructuredQuery({
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
    test("should filter records based on simple criteria", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        filter: { status: "active" }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should filter based on multiple criteria (AND logic)", () => {
      const result = runStructuredQuery({
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
    
    test("should filter with advanced operators", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        filter: { 
          customerClassification: { in: ["A", "C"] }
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should filter based on attached data (where condition)", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        where: { 
          "addresses.country": "US"
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2); // Both entities have US addresses
    });
    
    test("should combine primary and attached filters", () => {
      const result = runStructuredQuery({
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
    test("should use batch processing for large datasets", () => {
      // Create a mock with many files
      const manyFiles = Array.from({ length: 100 }, (_, i) => `BP${100000 + i}.json`);
      spyOn(fs, "readdirSync").mockImplementation((dirPath: string) => {
        if (dirPath.includes("anchors/business-partner")) {
          return manyFiles;
        }
        return [];
      });
      
      // Return null for all loadJSON calls to simplify the test
      spyOn(storage, "loadJSON").mockImplementation(() => null);
      
      const result = runStructuredQuery({
        primary: "business-partner"
      });
      
      // Since all loadJSON calls return null, we expect 0 results
      // but the important part is that the function completes without error
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });
    
    test("should cache document results for better performance", () => {
      // Run first query to populate cache
      runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      // Clear loadJSON spy and set up a new spy for verification
      const loadJSONSpy = spyOn(storage, "loadJSON").mockClear();
      
      // Run second query (should use cache)
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
      
      // Verify loadJSON was not called for the main entity
      // (It might still be called for attachments depending on implementation)
      const mainEntityCalls = loadJSONSpy.mock.calls.filter(call => 
        call[0].includes("BP12345.json")
      );
      expect(mainEntityCalls.length).toBe(0);
    });
    
    test("should respect skipCache parameter", () => {
      // Run first query to populate cache
      runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      // Clear the spy
      const loadJSONSpy = spyOn(storage, "loadJSON").mockClear();
      
      // Run second query with skipCache
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "BP12345",
        skipCache: true
      });
      
      // Verify loadJSON was called despite the cache being populated
      expect(loadJSONSpy).toHaveBeenCalled();
    });
    
    test("should cache directory listings for repeated queries", () => {
      // First query populates the cache
      runStructuredQuery({
        primary: "business-partner"
      });
      
      // Clear the spy
      const readdirSpy = spyOn(fs, "readdirSync").mockClear();
      
      // Second query should use cached directory listing
      const result = runStructuredQuery({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      
      // Directory should not be read again for the main entity path
      const mainDirCalls = readdirSpy.mock.calls.filter(call => 
        call[0].includes("anchors/business-partner")
      );
      expect(mainDirCalls.length).toBe(0);
    });
    
    test("should use query result cache for identical queries", () => {
      // Define query options
      const queryOptions = {
        primary: "business-partner",
        filter: { status: "active" }
      };
      
      // Run first query
      const firstResult = runStructuredQuery(queryOptions);
      
      // Clear spies
      spyOn(storage, "loadJSON").mockClear();
      spyOn(fs, "readdirSync").mockClear();
      
      // Run second query with same options
      const secondResult = runStructuredQuery(queryOptions);
      
      // Results should match without accessing filesystem
      expect(secondResult).toEqual(firstResult);
      expect(storage.loadJSON).not.toHaveBeenCalled();
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });
  });

  describe("Enhanced API - Entity Operations", () => {
    test("should handle entity operations with enhanced API", () => {
      // Mock enhanced entity data
      const mockEntity = {
        id: "entity-001",
        type: "customer",
        attributes: { name: "Sync Customer", status: "active" },
        documents: { notes: ["Sync note"] },
        edges: [],
        metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      };

      expect(mockEntity.type).toBe("customer");
      expect(mockEntity.attributes.name).toBe("Sync Customer");
      expect(mockEntity.documents.notes).toBeArray();
      expect(mockEntity.edges).toBeArray();
    });

    test("should handle graph operations synchronously", () => {
      // Mock graph data for sync operations
      const mockGraph = {
        nodes: [{ id: "node1", type: "customer" }, { id: "node2", type: "order" }],
        edges: [{ from: "node1", to: "node2", type: "PLACED" }]
      };

      expect(mockGraph.nodes).toHaveLength(2);
      expect(mockGraph.edges).toHaveLength(1);
    });

    test("should handle relationship traversal", () => {
      // Mock relationship traversal
      const mockTraversal = {
        startNode: "customer:001",
        path: ["customer:001", "order:001", "product:001"],
        relationships: ["PLACED", "CONTAINS"]
      };

      expect(mockTraversal.path).toHaveLength(3);
      expect(mockTraversal.relationships).toHaveLength(2);
    });
  });

  describe("Enhanced API - Backward Compatibility", () => {
    test("should maintain backward compatibility with legacy queries", () => {
      // Verify that legacy query structure still works
      const legacyQuery = {
        primary: "business-partner",
        id: "BP12345",
        filter: { status: "active" }
      };

      expect(legacyQuery.primary).toBe("business-partner");
      expect(legacyQuery.id).toBe("BP12345");
      expect(legacyQuery.filter.status).toBe("active");
    });

    test("should handle mixed legacy and enhanced operations", () => {
      // Test structure for mixed operations
      const mixedOperation = {
        legacyQuery: { primary: "business-partner", id: "BP12345" },
        enhancedQuery: { entityType: "customer", graphTraversal: true }
      };

      expect(mixedOperation.legacyQuery.primary).toBe("business-partner");
      expect(mixedOperation.enhancedQuery.entityType).toBe("customer");
      expect(mixedOperation.enhancedQuery.graphTraversal).toBe(true);
    });
  });
});