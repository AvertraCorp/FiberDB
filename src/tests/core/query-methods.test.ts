/**
 * Query Method Tests - Legacy and Enhanced API
 * Testing both the legacy query methods and enhanced API with mocked dependencies
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, mock, spyOn } from "bun:test";
import { runStructuredQuery } from "../../core/query/sync";
import { runStructuredQueryAsync } from "../../core/query/async";
import { FiberDB } from "../../api/fiberdb";
import { CustomStorageEngine } from "../../core/storage/engines/custom-storage-engine";
import { queryCache } from "../../utils/cache";
import * as storage from "../../core/storage";
import fs from "fs";
import path from "path";

// Mock data for testing
const mockPartner = {
  id: "BP12345",
  name: "Test Partner",
  status: "active",
  industry: "Technology",
  createdAt: new Date().toISOString()
};

const mockInactivePartner = {
  id: "BP67890",
  name: "Inactive Partner",
  status: "inactive",
  industry: "Healthcare",
  createdAt: new Date().toISOString()
};

const mockEntity = {
  id: 'test-001',
  type: 'customer',
  attributes: {
    name: 'Test Customer',
    industry: 'Technology',
    revenue: 1000000,
    active: true
  },
  documents: {
    contracts: [
      { id: 'contract-1', value: 100000, status: 'active' }
    ],
    communications: [
      { date: new Date(), type: 'email', subject: 'Test' }
    ]
  },
  edges: [
    {
      id: 'test-edge-1',
      type: 'EMPLOYS',
      target: 'user:user-001',
      properties: { department: 'Engineering' }
    }
  ],
  metadata: {
    created: new Date(),
    updated: new Date(),
    version: 1,
    schemaVersion: 1
  }
};

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
  // Clear cache
  queryCache.clear();
  
  // Clear previous mocks
  fsMocks.forEach(mock => mock.mockRestore?.());
  storageMocks.forEach(mock => mock.mockRestore?.());
  fsMocks = [];
  storageMocks = [];
  
  // Mock fs module
  const existsSyncMock = spyOn(fs, "existsSync").mockImplementation((path: string) => {
    // Always return true to pretend directories exist
    return true;
  });
  fsMocks.push(existsSyncMock);
  
  const readdirSyncMock = spyOn(fs, "readdirSync").mockImplementation((dirPath: string) => {
    if (dirPath.includes("anchors")) {
      return ["BP12345.json", "BP67890.json"];
    }
    if (dirPath.includes("attached")) {
      return ["addresses.json"];
    }
    return [];
  });
  fsMocks.push(readdirSyncMock);
  
  // Mock storage methods
  const loadJSONMock = spyOn(storage, "loadJSON").mockImplementation((filePath: string) => {
    if (filePath.includes("BP12345.json")) return mockPartner;
    if (filePath.includes("BP67890.json")) return mockInactivePartner;
    if (filePath.includes("addresses.json")) return [
      { id: "addr1", street: "Main St", city: "Test City" },
      { id: "addr2", street: "Second St", city: "Another City" }
    ];
    return null;
  });
  
  // Mock async storage methods
  spyOn(storage, "existsAsync").mockImplementation(async (path: string) => {
    return true;
  });
  
  spyOn(storage, "readdirAsync").mockImplementation(async (dirPath: string) => {
    if (dirPath.includes("anchors")) {
      return ["BP12345.json", "BP67890.json"];
    }
    if (dirPath.includes("attached")) {
      return ["addresses.json"];
    }
    return [];
  });
  
  spyOn(storage, "loadJSONAsync").mockImplementation(async (filePath: string) => {
    if (filePath.includes("BP12345.json")) return mockPartner;
    if (filePath.includes("BP67890.json")) return mockInactivePartner;
    if (filePath.includes("addresses.json")) return [
      { id: "addr1", street: "Main St", city: "Test City" },
      { id: "addr2", street: "Second St", city: "Another City" }
    ];
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

describe("Legacy Query Methods", () => {
  describe("Synchronous Query", () => {
    test("should handle basic queries", () => {
      const result = runStructuredQuery({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0].id).toBe("BP12345");
      expect(result[1].id).toBe("BP67890");
    });
    
    test("should filter records based on criteria", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        filter: { status: "active" }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should handle queries with ID", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });
    
    test("should use cache for repeated queries", () => {
      // First query
      runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      // Reset the mock to verify it's not called again
      const loadJSONSpy = spyOn(storage, "loadJSON").mockClear();
      
      // Second query should use cache
      const cachedResult = runStructuredQuery({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(cachedResult).toBeArray();
      expect(cachedResult.length).toBe(1);
      expect(loadJSONSpy).not.toHaveBeenCalled();
    });

    test("should handle field selection", () => {
      const result = runStructuredQuery({
        primary: "business-partner",
        id: "BP12345",
        include: ["id", "name", "status"]
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("status");
    });
  });
  
  describe("Asynchronous Query", () => {
    test("should handle basic queries", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0].id).toBe("BP12345");
      expect(result[1].id).toBe("BP67890");
    });
    
    test("should handle queries with ID", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        id: "BP12345"
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("BP12345");
    });

    test("should handle filtering with operators", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        filter: { 
          status: { eq: "active" },
          industry: { ne: "Finance" }
        }
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(1);
      expect(result[0].status).toBe("active");
    });

    test("should handle parallel processing", async () => {
      const result = await runStructuredQueryAsync({
        primary: "business-partner",
        useParallel: true
      });
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
    });
  });
});

describe("Enhanced API Query Methods", () => {
  describe("FiberDB Instance", () => {
    test("should create and initialize FiberDB instance", async () => {
      const db = new FiberDB('./test-data');
      expect(db).toBeDefined();
      expect(typeof db.initialize).toBe("function");
    });

    test("should handle entity creation and retrieval", () => {
      const db = new FiberDB('./test-data');
      
      // Test entity operations without storage initialization
      expect(() => db.saveEntity(mockEntity)).not.toThrow();
      expect(() => db.getEntity('customer', 'test-001')).not.toThrow();
      expect(() => db.deleteEntity('customer', 'test-001')).not.toThrow();
    });

    test("should handle relationship operations", async () => {
      const db = new FiberDB('./test-data');
      
      // First create the entities that will be related
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

      // Now test relationship operations
      expect(() => db.addRelationship(
        'customer', 'cust-1',
        'user', 'user-1',
        'EMPLOYS',
        { department: 'Engineering' }
      )).not.toThrow();

      expect(() => db.removeRelationship(
        'customer', 'cust-1',
        'EMPLOYS',
        'user-1'
      )).not.toThrow();
    });

    test("should handle enhanced queries", () => {
      const db = new FiberDB('./test-data');
      
      const queryParams = {
        from: 'customer',
        where: {
          attributes: {
            industry: 'Technology',
            active: true,
            revenue: { $gte: 500000 }
          },
          documents: {
            contracts: { $exists: true }
          },
          edges: {
            type: 'EMPLOYS'
          }
        },
        include: ['attributes.name', 'attributes.revenue'],
        limit: 10,
        offset: 0
      };

      expect(() => db.enhancedQuery(queryParams)).not.toThrow();
    });

    test("should handle graph queries", () => {
      const db = new FiberDB('./test-data');
      
      const graphParams = {
        startNodes: ['customer:cust-001'],
        traversal: {
          direction: 'BOTH' as const,
          maxDepth: 3,
          edgeTypes: ['EMPLOYS', 'OWNS', 'USES'],
          nodeFilter: { type: 'user' },
          edgeFilter: { 
            properties: { department: 'Engineering' } 
          }
        },
        returnType: 'NODES' as const
      };

      expect(() => db.queryGraph(graphParams)).not.toThrow();
    });

    test("should handle path finding", () => {
      const db = new FiberDB('./test-data');
      
      expect(() => db.findPath('customer:cust-1', 'product:prod-1', 3)).not.toThrow();
    });

    test("should provide backward compatibility", async () => {
      const db = new FiberDB('./test-data');
      
      // Legacy methods should exist
      expect(typeof db.saveAnchor).toBe("function");
      expect(typeof db.attachToAnchor).toBe("function");
      expect(typeof db.query).toBe("function");

      // Should handle legacy API calls
      expect(() => db.saveAnchor('customer', 'legacy-1', { name: 'Legacy Customer' })).not.toThrow();
      
      // Wait a bit for the save to complete before trying to attach
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(() => db.attachToAnchor('customer:legacy-1', 'notes', { content: 'Legacy note' })).not.toThrow();
      expect(() => db.query({ primary: 'customer', filter: { name: 'Legacy Customer' } })).not.toThrow();
    });
  });

  describe("Query Parameter Validation", () => {
    test("should validate enhanced query parameters", () => {
      const db = new FiberDB('./test-data');
      
      // Valid parameters should not throw
      expect(() => db.enhancedQuery({
        from: 'customer'
      })).not.toThrow();

      expect(() => db.enhancedQuery({
        from: ['customer', 'user']
      })).not.toThrow();

      // Complex where clause
      expect(() => db.enhancedQuery({
        from: 'customer',
        where: {
          attributes: { 
            industry: { $in: ['Technology', 'Healthcare'] },
            revenue: { $gte: 1000000, $lt: 10000000 }
          },
          documents: {
            contracts: { $exists: true }
          },
          edges: {
            type: ['EMPLOYS', 'OWNS'],
            target: { $regex: 'user:' }
          }
        }
      })).not.toThrow();
    });

    test("should validate graph query parameters", () => {
      const db = new FiberDB('./test-data');
      
      // Valid graph parameters
      expect(() => db.queryGraph({
        startNodes: ['customer:cust-001'],
        traversal: {
          direction: 'OUT',
          maxDepth: 2
        },
        returnType: 'NODES'
      })).not.toThrow();

      // Multiple start nodes
      expect(() => db.queryGraph({
        startNodes: ['customer:cust-001', 'customer:cust-002'],
        traversal: {
          direction: 'BOTH',
          maxDepth: 3,
          edgeTypes: ['EMPLOYS']
        },
        returnType: 'PATHS'
      })).not.toThrow();
    });
  });

  describe("Mixed API Usage", () => {
    test("should allow mixed legacy and enhanced API usage", async () => {
      const db = new FiberDB('./test-data');
      
      expect(() => {
        // Create data with legacy API
        db.saveAnchor('mixed', 'mixed-1', { name: 'Mixed Entity' });
        
        // Query with legacy API
        db.query({ primary: 'mixed', filter: { name: 'Mixed Entity' } });
        
        // Query with enhanced API
        db.enhancedQuery({
          from: 'mixed',
          where: {
            attributes: { name: 'Mixed Entity' }
          }
        });
        
        // Graph traversal from legacy data
        db.queryGraph({
          startNodes: ['mixed:mixed-1'],
          traversal: { direction: 'OUT', maxDepth: 2 },
          returnType: 'NODES'
        });
      }).not.toThrow();
      
      // Wait for any async operations to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(() => {
        db.attachToAnchor('mixed:mixed-1', 'metadata', { created: new Date() });
      }).not.toThrow();
    });
  });

  describe("Performance Features", () => {
    test("should handle performance options", () => {
      const db = new FiberDB('./test-data');
      
      // Cache control
      expect(() => db.enhancedQuery({
        from: 'customer',
        useCache: false,
        useParallel: true,
        includeMetrics: true
      })).not.toThrow();

      // Index usage
      expect(() => db.enhancedQuery({
        from: 'customer',
        where: { attributes: { industry: 'Technology' } },
        useIndexes: true
      })).not.toThrow();
    });

    test("should handle statistics and monitoring", () => {
      const db = new FiberDB('./test-data');
      
      expect(() => db.getStats()).not.toThrow();
    });
  });
});

describe("Error Handling", () => {
  test("should handle missing entities gracefully", () => {
    const db = new FiberDB('./test-data');
    
    expect(() => db.getEntity('nonexistent', 'missing-id')).not.toThrow();
    expect(() => db.deleteEntity('nonexistent', 'missing-id')).not.toThrow();
  });

  test("should handle malformed query parameters", () => {
    const db = new FiberDB('./test-data');
    
    // Should not throw for reasonable parameter combinations
    expect(() => db.enhancedQuery({
      from: 'customer',
      where: undefined,
      include: [],
      exclude: []
    })).not.toThrow();
  });

  test("should handle relationship errors", () => {
    const db = new FiberDB('./test-data');
    
    // Test should expect errors when adding relationships between non-existent entities
    expect(() => db.addRelationship(
      'nonexistent', 'missing-1',
      'user', 'user-1',
      'INVALID_RELATIONSHIP'
    )).toThrow();
  });
});

describe("Type Safety", () => {
  test("should enforce proper entity structure", () => {
    const validEntity = {
      id: 'type-test-1',
      type: 'test',
      attributes: { name: 'Test' },
      documents: { notes: [] },
      edges: [],
      metadata: {
        created: new Date(),
        updated: new Date(),
        version: 1,
        schemaVersion: 1
      }
    };

    const db = new FiberDB('./test-data');
    expect(() => db.saveEntity(validEntity)).not.toThrow();
  });

  test("should enforce proper edge structure", async () => {
    const validEdge = {
      id: 'edge-test-1',
      type: 'TEST_RELATIONSHIP',
      target: 'user:user-001',
      properties: { test: true },
      weight: 1.0
    };

    const db = new FiberDB('./test-data');
    
    // Create the entities first
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

    expect(() => db.addRelationship(
      'customer', 'cust-1',
      'user', 'user-1',
      'TEST_RELATIONSHIP',
      { test: true }
    )).not.toThrow();
  });
});