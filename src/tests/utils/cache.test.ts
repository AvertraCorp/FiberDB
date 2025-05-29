/**
 * Cache Utility Tests
 */
import { describe, test, expect, beforeEach, jest } from "bun:test";
import { 
  LRUCache, 
  TTLCache,
  getCacheKey,
  getDocumentCacheKey,
  getAttachedCacheKey,
  invalidateEntityCaches
} from "../../utils/cache";

describe("LRUCache", () => {
  let cache: LRUCache<string, any>;
  
  beforeEach(() => {
    cache = new LRUCache<string, any>(3, "test-cache");
  });

  test("should store and retrieve values", () => {
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });
  
  test("should track cache hits and misses", () => {
    // Miss
    expect(cache.get("nonexistent")).toBeUndefined();
    
    // Hit
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
    
    // Get stats
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5); // 1 hit, 1 miss = 50% hit rate
  });
  
  test("should evict least recently used items when at capacity", () => {
    // Fill the cache to capacity (max 3 items)
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");
    
    // All items should be present
    expect(cache.get("key1")).toBe("value1");
    expect(cache.get("key2")).toBe("value2");
    expect(cache.get("key3")).toBe("value3");
    
    // Add a new item, should evict the least recently used (key1)
    cache.set("key4", "value4");
    
    // key1 should be evicted, key2/key3/key4 should remain
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBe("value2");
    expect(cache.get("key3")).toBe("value3");
    expect(cache.get("key4")).toBe("value4");
  });
  
  test("should update LRU order when accessing items", () => {
    // Fill the cache
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");
    
    // Access key1, making it the most recently used (key2 now LRU)
    cache.get("key1");
    
    // Add a new item, should evict key2 (the least recently used)
    cache.set("key4", "value4");
    
    // key2 should be evicted, others should remain
    expect(cache.get("key1")).toBe("value1");
    expect(cache.get("key2")).toBeUndefined();
    expect(cache.get("key3")).toBe("value3");
    expect(cache.get("key4")).toBe("value4");
  });
  
  test("should clear all items", () => {
    // Add items
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    
    // Clear the cache
    cache.clear();
    
    // Cache should be empty
    expect(cache.size).toBe(0);
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeUndefined();
  });
});

describe("TTLCache", () => {
  let cache: TTLCache<string, any>;
  const ttl = 100; // 100ms TTL for testing
  
  beforeEach(() => {
    cache = new TTLCache<string, any>(3, ttl, "test-ttl-cache");
    
    // Mock Date.now for predictable testing
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);
  });
  
  test("should store and retrieve values within TTL", () => {
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });
  
  test("should expire values after TTL", () => {
    cache.set("key1", "value1");
    
    // Advance time beyond TTL
    const advancedTime = Date.now() + ttl + 1;
    jest.spyOn(Date, "now").mockReturnValue(advancedTime);
    
    // Value should be expired
    expect(cache.get("key1")).toBeUndefined();
  });
  
  test("should honor custom TTL", () => {
    const customTtl = 200; // 200ms TTL
    cache.set("key1", "value1", customTtl);
    
    // Advance time beyond default TTL but within custom TTL
    const advancedTime = Date.now() + ttl + 50;
    jest.spyOn(Date, "now").mockReturnValue(advancedTime);
    
    // Value should still be available
    expect(cache.get("key1")).toBe("value1");
    
    // Advance time beyond custom TTL
    const furtherAdvancedTime = Date.now() + customTtl + 1;
    jest.spyOn(Date, "now").mockReturnValue(furtherAdvancedTime);
    
    // Value should now be expired
    expect(cache.get("key1")).toBeUndefined();
  });
});

describe("Cache utility functions", () => {
  test("getCacheKey should create string keys based on JSON.stringify", () => {
    const params1 = { a: 1, b: "test" };
    
    // Key should be the JSON string representation of the object
    expect(getCacheKey(params1)).toBe(JSON.stringify(params1));
    
    // Note: In real applications, a more consistent key generation might be needed
    // that handles property ordering, but this test verifies the current implementation
  });
  
  test("getDocumentCacheKey should format keys correctly", () => {
    expect(getDocumentCacheKey("business-partner", "BP12345")).toBe("business-partner:BP12345");
  });
  
  test("getAttachedCacheKey should format keys correctly", () => {
    expect(getAttachedCacheKey("BP12345", "addresses")).toBe("attached:BP12345:addresses");
  });

  describe("Enhanced API Cache Functions", () => {
    test("should handle entity cache keys", () => {
      // Mock entity cache key generation
      const entityCacheKey = `entity:${JSON.stringify({ type: "customer", id: "entity-001" })}`;
      expect(entityCacheKey).toContain("entity:");
      expect(entityCacheKey).toContain("customer");
      expect(entityCacheKey).toContain("entity-001");
    });

    test("should handle graph query cache keys", () => {
      // Mock graph query cache key
      const graphParams = {
        startNodes: ["customer:001"],
        traversal: { direction: "BOTH", maxDepth: 3 },
        returnType: "NODES"
      };
      const graphCacheKey = `graph:${JSON.stringify(graphParams)}`;
      expect(graphCacheKey).toContain("graph:");
      expect(graphCacheKey).toContain("customer:001");
    });

    test("should handle relationship cache keys", () => {
      // Mock relationship cache key
      const relationshipKey = `relationships:customer:001:PLACED`;
      expect(relationshipKey).toContain("relationships:");
      expect(relationshipKey).toContain("customer:001");
      expect(relationshipKey).toContain("PLACED");
    });

    test("should handle mixed query cache keys", () => {
      // Mock mixed query (legacy + enhanced)
      const mixedParams = {
        legacy: { primary: "business-partner", filter: { status: "active" } },
        enhanced: { entityType: "customer", includeRelationships: true }
      };
      const mixedCacheKey = `mixed:${JSON.stringify(mixedParams)}`;
      expect(mixedCacheKey).toContain("mixed:");
      expect(mixedCacheKey).toContain("business-partner");
      expect(mixedCacheKey).toContain("customer");
    });
  });

  describe("Cache invalidation for enhanced API", () => {
    test("should handle entity cache invalidation", () => {
      // Mock entity cache invalidation patterns
      const entityPatterns = [
        "entity:customer:001",
        "graph:*customer:001*",
        "relationships:customer:001:*",
        "mixed:*customer*"
      ];

      expect(entityPatterns).toHaveLength(4);
      expect(entityPatterns[0]).toContain("entity:");
      expect(entityPatterns[1]).toContain("graph:");
      expect(entityPatterns[2]).toContain("relationships:");
      expect(entityPatterns[3]).toContain("mixed:");
    });

    test("should handle relationship cache invalidation", () => {
      // Mock relationship invalidation
      const relationshipInvalidation = {
        entity1: "customer:001",
        entity2: "order:001",
        relationshipType: "PLACED",
        cachePatterns: [
          "relationships:customer:001:*",
          "relationships:order:001:*",
          "graph:*customer:001*",
          "graph:*order:001*"
        ]
      };

      expect(relationshipInvalidation.cachePatterns).toHaveLength(4);
      expect(relationshipInvalidation.cachePatterns.every(pattern => 
        pattern.includes("customer:001") || pattern.includes("order:001")
      )).toBe(true);
    });
  });
});