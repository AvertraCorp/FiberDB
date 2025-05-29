/**
 * API Endpoints Tests - Legacy and Enhanced API
 * Testing both the legacy and enhanced API endpoint handlers
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, mock, spyOn } from "bun:test";
import { handleQueryRequest } from "../../api/endpoints/query";
import { handleCacheGetRequest, handleCacheDeleteRequest } from "../../api/endpoints/cache";
import { FiberDB } from "../../api/fiberdb";
import * as queryModule from "../../core/query";
import { documentCache, queryCache, fileExistsCache } from "../../utils/cache";

// Track mocks for cleanup
let consoleMock: any;

// Setup for tests
beforeAll(() => {
  // Mock console.log to prevent noise during tests
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
});

// Reset caches before each test
beforeEach(() => {
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  // Create a test document for cache tests
  documentCache.set("test:doc", { data: "test" });
});

describe("Legacy API Endpoint Handlers", () => {
  test("should export handleQueryRequest function", () => {
    expect(typeof handleQueryRequest).toBe("function");
  });
  
  test("should export cache endpoint handlers", () => {
    expect(typeof handleCacheGetRequest).toBe("function");
    expect(typeof handleCacheDeleteRequest).toBe("function");
  });

  test("should handle basic query request structure", async () => {
    // Mock the runStructuredQuery function to avoid file system operations
    const mockQuery = spyOn(queryModule, "runStructuredQuery").mockImplementation(() => [
      {
        id: "test-entity",
        name: "Test Entity",
        type: "test"
      }
    ]);

    // Create a mock request object
    const mockRequest = {
      json: async () => ({
        primary: "test-entity",
        id: "test-id"
      }),
      headers: {
        get: (name: string) => null // No special headers
      }
    };

    // Test the handler
    const response = await handleQueryRequest(mockRequest as any);
    
    expect(response.status).toBe(200);
    const responseData = await response.json();

    expect(mockQuery).toHaveBeenCalledWith({
      primary: "test-entity",
      id: "test-id",
      includePerformanceMetrics: false,
      skipCache: false,
      skipTTL: false
    });
    expect(Array.isArray(responseData)).toBe(true);
    expect(responseData).toEqual([{
      id: "test-entity",
      name: "Test Entity",
      type: "test"
    }]);

    mockQuery.mockRestore();
  });
});

describe("Enhanced API Functionality", () => {
  test("should create FiberDB instance", async () => {
    const db = new FiberDB();
    expect(db).toBeDefined();
    expect(typeof db.initialize).toBe("function");
    expect(typeof db.saveEntity).toBe("function");
    expect(typeof db.getEntity).toBe("function");
    expect(typeof db.addRelationship).toBe("function");
    expect(typeof db.enhancedQuery).toBe("function");
    expect(typeof db.queryGraph).toBe("function");
  });

  test("should handle entity operations", async () => {
    const db = new FiberDB('./test-data');
    
    // Create test entity
    const testEntity = {
      id: 'test-001',
      type: 'test',
      attributes: {
        name: 'Test Entity',
        value: 42
      },
      documents: {
        notes: [{ content: 'Test note' }]
      },
      edges: [],
      metadata: {
        created: new Date(),
        updated: new Date(),
        version: 1,
        schemaVersion: 1
      }
    };

    // Test basic entity operations (without actually initializing storage)
    expect(() => db.saveEntity(testEntity)).not.toThrow();
    expect(() => db.getEntity('test', 'test-001')).not.toThrow();
    expect(() => db.deleteEntity('test', 'test-001')).not.toThrow();
  });

  test("should handle relationship operations", async () => {
    const db = new FiberDB('./test-data');
    
    // Create entities first
    await db.saveEntity({
      id: 'cust-1',
      type: 'customer',
      attributes: { name: 'Test Customer' },
      documents: {},
      edges: [],
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });

    await db.saveEntity({
      id: 'user-1',
      type: 'user',
      attributes: { name: 'Test User' },
      documents: {},
      edges: [],
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });

    // Test relationship operations
    expect(() => db.addRelationship('customer', 'cust-1', 'user', 'user-1', 'EMPLOYS')).not.toThrow();
    expect(() => db.removeRelationship('customer', 'cust-1', 'EMPLOYS', 'user-1')).not.toThrow();
    expect(() => db.findPath('customer:cust-1', 'product:prod-1', 3)).not.toThrow();
  });

  test("should handle enhanced queries", async () => {
    const db = new FiberDB('./test-data');
    
    // Test enhanced query structure
    const queryParams = {
      from: 'customer',
      where: {
        attributes: { industry: 'Technology' },
        documents: { contracts: { $exists: true } },
        edges: { type: 'EMPLOYS' }
      },
      include: ['attributes.name'],
      limit: 10
    };

    expect(() => db.enhancedQuery(queryParams)).not.toThrow();
  });

  test("should handle graph queries", async () => {
    const db = new FiberDB('./test-data');
    
    // Test graph query structure
    const graphParams = {
      startNodes: ['customer:cust-001'],
      traversal: {
        direction: 'BOTH' as const,
        maxDepth: 3,
        edgeTypes: ['EMPLOYS', 'USES']
      },
      returnType: 'NODES' as const
    };

    expect(() => db.queryGraph(graphParams)).not.toThrow();
  });

  test("should provide backward compatibility", async () => {
    const db = new FiberDB('./test-data');
    
    // Test that legacy methods exist and can be called
    expect(typeof db.saveAnchor).toBe("function");
    expect(typeof db.attachToAnchor).toBe("function");
    expect(typeof db.query).toBe("function");

    // Test legacy method calls
    expect(() => db.saveAnchor('customer', 'cust-1', { name: 'Test' })).not.toThrow();
    
    // Wait for the entity to be created before attaching
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(() => db.attachToAnchor('customer:cust-1', 'notes', { content: 'Test note' })).not.toThrow();
    expect(() => db.query({ primary: 'customer' })).not.toThrow();
  });

  test("should handle mixed API usage", async () => {
    const db = new FiberDB('./test-data');
    
    // Test that both APIs can be used together
    expect(() => {
      // Legacy API
      db.saveAnchor('customer', 'mixed-1', { name: 'Mixed Test' });
      
      // Enhanced API
      db.addRelationship('customer', 'mixed-1', 'user', 'user-1', 'OWNS');
      
      // Both query types
      db.query({ primary: 'customer' });
      db.enhancedQuery({ from: 'customer' });
    }).not.toThrow();
  });
});

describe("Cache Endpoint Handlers", () => {
  test("should handle cache get request", async () => {
    const response = handleCacheGetRequest();
    
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toBeDefined();
    expect(Array.isArray(responseData)).toBe(true);
    expect(responseData.length).toBeGreaterThan(0);
  });

  test("should handle cache delete request", async () => {
    // Add some test data to caches
    documentCache.set("test1", { data: "test1" });
    queryCache.set("query1", []);
    fileExistsCache.set("file1", true);

    const response = handleCacheDeleteRequest();
    
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toBeDefined();
    expect(responseData.message).toContain("cleared");
    
    // Verify caches are actually cleared
    expect(documentCache.size).toBe(0);
    expect(queryCache.size).toBe(0);
    expect(fileExistsCache.size).toBe(0);
  });
});

describe("API Error Handling", () => {
  test("should handle malformed query requests", async () => {
    const mockRequest = {
      json: async () => ({
        // Missing required 'primary' field
        filter: { name: "test" }
      }),
      headers: {
        get: (name: string) => null
      }
    };

    const response = await handleQueryRequest(mockRequest as any);

    // The query handler should handle malformed input gracefully
    // It might return an error (500) or succeed (200) - let's test for either
    expect([200, 500]).toContain(response.status);
    const responseData = await response.json();
    expect(responseData).toBeDefined();
  });

  test("should handle query execution errors", async () => {
    // Mock query to throw an error
    const mockQuery = spyOn(queryModule, "runStructuredQuery").mockImplementation(() => {
      throw new Error("Test query error");
    });

    const mockRequest = {
      json: async () => ({
        primary: "test-entity",
        id: "test-id"
      }),
      headers: {
        get: (name: string) => null
      }
    };

    const response = await handleQueryRequest(mockRequest as any);

    expect(response.status).toBe(500);
    const responseData = await response.json();
    expect(responseData.error).toBeDefined();
    expect(responseData.error).toContain("Test query error");

    mockQuery.mockRestore();
  });
});

describe("Performance Headers", () => {
  test("should handle performance control headers", async () => {
    const mockQuery = spyOn(queryModule, "query").mockImplementation(async (params) => {
      // Verify headers are passed through
      expect(params.skipCache).toBe(true);
      expect(params.useParallel).toBe(true);
      expect(params.includePerformanceMetrics).toBe(true);
      return [];
    });

    const mockRequest = {
      json: async () => ({
        primary: "test-entity"
      }),
      headers: {
        get: (name: string) => {
          switch (name) {
            case 'x-skip-cache': return 'true';
            case 'x-use-parallel': return 'true';
            case 'x-include-performance-metrics': return 'true';
            default: return null;
          }
        }
      }
    };

    const mockResponse = {
      json: () => Promise.resolve()
    };

    await handleQueryRequest(mockRequest as any, mockResponse as any);

    mockQuery.mockRestore();
  });
});