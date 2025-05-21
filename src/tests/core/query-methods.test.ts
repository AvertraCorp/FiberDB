/**
 * Query Method Tests
 * Testing the core query methods with mocked dependencies
 */
import { describe, test, expect, beforeAll, beforeEach, mock, spyOn } from "bun:test";
import { runStructuredQuery } from "../../core/query/sync";
import { runStructuredQueryAsync } from "../../core/query/async";
import { queryCache } from "../../utils/cache";
import * as storage from "../../core/storage";
import fs from "fs";
import path from "path";

// Mock data for testing
const mockPartner = {
  id: "BP12345",
  name: "Test Partner",
  status: "active",
  createdAt: new Date().toISOString()
};

const mockInactivePartner = {
  id: "BP67890",
  name: "Inactive Partner",
  status: "inactive",
  createdAt: new Date().toISOString()
};

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
  // Clear cache
  queryCache.clear();
  
  // Mock fs module
  spyOn(fs, "existsSync").mockImplementation((path: string) => {
    // Always return true to pretend directories exist
    return true;
  });
  
  spyOn(fs, "readdirSync").mockImplementation((dirPath: string) => {
    if (dirPath.includes("anchors")) {
      return ["BP12345.json", "BP67890.json"];
    }
    if (dirPath.includes("attached")) {
      return ["addresses.json"];
    }
    return [];
  });
  
  // Mock storage methods
  spyOn(storage, "loadJSON").mockImplementation((filePath: string) => {
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
});

describe("Query Methods", () => {
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
  });
});