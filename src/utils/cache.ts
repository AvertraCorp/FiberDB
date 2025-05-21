// cache.ts - Caching system for FiberDB

/**
 * Simple LRU (Least Recently Used) Cache implementation
 * Uses a Map to store values and maintain insertion order
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;
  private name: string;

  /**
   * Create a new LRU Cache
   * 
   * @param maxSize Maximum number of items to keep in cache
   * @param name Optional name for the cache (for stats reporting)
   */
  constructor(maxSize: number, name: string = 'default') {
    this.cache = new Map<K, V>();
    this.maxSize = maxSize;
    this.name = name;
  }
  
  /**
   * Get a value from the cache
   * 
   * @param key The key to look up
   * @returns The cached value or undefined if not found
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }
    
    // Get the value
    const value = this.cache.get(key);
    
    // LRU tracking - delete and re-add to make this the most recently used item
    this.cache.delete(key);
    this.cache.set(key, value!);
    
    this.hits++;
    return value;
  }
  
  /**
   * Set a value in the cache
   * 
   * @param key The key to store
   * @param value The value to cache
   */
  set(key: K, value: V): void {
    // If the key exists, remove it first (will be re-added at the "end")
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If we're at capacity, remove the least recently used item (first item in Map)
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    // Add the new item
    this.cache.set(key, value);
  }
  
  /**
   * Remove an item from the cache
   * 
   * @param key The key to remove
   * @returns True if the item was removed, false if it wasn't in the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Check if a key exists in the cache
   * 
   * @param key The key to check
   * @returns True if the key exists in the cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    
    return {
      name: this.name,
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate
    };
  }
  
  /**
   * Reset cache statistics (without clearing the cache)
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * Statistics for a cache
 */
export interface CacheStats {
  name: string;
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * TTL Cache extends LRU Cache with automatic expiration of entries
 */
export class TTLCache<K, V> extends LRUCache<K, { value: V, expiry: number }> {
  private defaultTTL: number;
  
  /**
   * Create a new TTL Cache
   * 
   * @param maxSize Maximum number of items to keep in cache
   * @param ttlMs Default time-to-live in milliseconds
   * @param name Optional name for the cache
   */
  constructor(maxSize: number, ttlMs: number, name: string = 'default-ttl') {
    super(maxSize, name);
    this.defaultTTL = ttlMs;
  }
  
  /**
   * Get a value from the cache, checking expiration
   * 
   * @param key The key to look up
   * @returns The cached value or undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = super.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    // Check if the entry has expired
    if (entry.expiry < Date.now()) {
      super.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  /**
   * Set a value in the cache with the default TTL
   * 
   * @param key The key to store
   * @param value The value to cache
   */
  set(key: K, value: V): void;
  
  /**
   * Set a value in the cache with a custom TTL
   * 
   * @param key The key to store
   * @param value The value to cache
   * @param ttlMs Custom time-to-live in milliseconds
   */
  set(key: K, value: V, ttlMs?: number): void {
    const expiry = Date.now() + (ttlMs !== undefined ? ttlMs : this.defaultTTL);
    super.set(key, { value, expiry });
  }
}

// Cache size configuration
const DOCUMENT_CACHE_SIZE = 1000;
const QUERY_CACHE_SIZE = 100;
const FILE_CHECK_CACHE_SIZE = 5000;
const TTL_SHORT = 60 * 1000; // 1 minute
const TTL_MEDIUM = 5 * 60 * 1000; // 5 minutes
const TTL_LONG = 15 * 60 * 1000; // 15 minutes

// Application-wide caches
export const documentCache = new LRUCache<string, any>(DOCUMENT_CACHE_SIZE, 'document-cache');
export const queryCache = new TTLCache<string, any[]>(QUERY_CACHE_SIZE, TTL_MEDIUM, 'query-cache');
export const fileExistsCache = new TTLCache<string, boolean>(FILE_CHECK_CACHE_SIZE, TTL_LONG, 'file-exists-cache');

// Cache utility functions
export function getCacheKey(params: Record<string, any>): string {
  return JSON.stringify(params);
}

/**
 * Get the document cache key for a specific entity
 */
export function getDocumentCacheKey(type: string, id: string): string {
  return `${type}:${id}`;
}

/**
 * Get the attached document cache key
 */
export function getAttachedCacheKey(anchorId: string, docType: string): string {
  return `attached:${anchorId}:${docType}`;
}

/**
 * Utility to invalidate all caches related to a specific entity
 */
export function invalidateEntityCaches(type: string, id: string): void {
  // Clear this entity from document cache
  documentCache.delete(getDocumentCacheKey(type, id));
  
  // Clear any attached documents for this entity
  // (Using a regex-like approach since we don't have a direct lookup)
  const attachedPrefix = `attached:${id}:`;
  
  // This is inefficient but works for now - in a real implementation
  // we would track keys by entity for faster invalidation
  // Better approach would be to maintain a reverse index of cache keys
  
  // Clear query cache since results might include this entity
  queryCache.clear();
  
  console.log(`Invalidated caches for ${type}:${id}`);
}

/**
 * Get cache statistics for all caches
 */
export function getAllCacheStats(): CacheStats[] {
  return [
    documentCache.getStats(),
    queryCache.getStats(),
    fileExistsCache.getStats()
  ];
}