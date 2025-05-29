/**
 * FiberDB API Client
 */

export interface QueryOptions {
  includePerformanceMetrics?: boolean;
  skipCache?: boolean;
  skipTTL?: boolean;
  useParallel?: boolean;
}

export interface QueryResponse {
  data: any[];
  metadata?: {
    totalCount: number;
    executionTime?: number;
    cacheHit?: boolean;
  };
  performanceMetrics?: {
    queryTime: number;
    indexUsage: string[];
    memoryUsage: number;
  };
}

export interface CacheStats {
  name: string;
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export interface CacheInfo {
  documentCache: CacheStats;
  queryCache: CacheStats;
  fileCheckCache: CacheStats;
}

class FiberDBClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:4001') {
    this.baseUrl = baseUrl;
  }

  private getHeaders(options: QueryOptions = {}): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (options.includePerformanceMetrics) {
      headers['X-Include-Performance-Metrics'] = 'true';
    }
    if (options.skipCache) {
      headers['X-Skip-Cache'] = 'true';
    }
    if (options.skipTTL) {
      headers['X-Skip-TTL'] = 'true';
    }
    if (options.useParallel) {
      headers['X-Use-Parallel'] = 'true';
    }

    return headers;
  }

  async query(queryBody: any, options: QueryOptions = {}): Promise<QueryResponse> {
    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: this.getHeaders(options),
      body: JSON.stringify(queryBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Query failed');
    }

    return response.json();
  }

  async getCacheInfo(): Promise<CacheInfo> {
    const response = await fetch(`${this.baseUrl}/cache`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch cache info');
    }

    const cacheArray: CacheStats[] = await response.json();
    
    // Convert array to expected object structure
    const cacheInfo: CacheInfo = {
      documentCache: cacheArray.find(c => c.name === 'document-cache') || { name: 'document-cache', size: 0, maxSize: 0, hits: 0, misses: 0, hitRate: 0 },
      queryCache: cacheArray.find(c => c.name === 'query-cache') || { name: 'query-cache', size: 0, maxSize: 0, hits: 0, misses: 0, hitRate: 0 },
      fileCheckCache: cacheArray.find(c => c.name === 'file-exists-cache') || { name: 'file-exists-cache', size: 0, maxSize: 0, hits: 0, misses: 0, hitRate: 0 }
    };

    return cacheInfo;
  }

  async clearCache(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/cache`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to clear cache');
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          primary: 'business-partner', 
          limit: 1, 
          skipTTL: true 
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const fiberDBClient = new FiberDBClient();
export default FiberDBClient;