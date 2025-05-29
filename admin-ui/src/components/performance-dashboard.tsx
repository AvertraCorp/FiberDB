'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fiberDBClient, CacheInfo } from '@/lib/api';
import { Activity, Database, Trash2, RefreshCw } from 'lucide-react';
import { formatPercentage } from '@/lib/utils';

export function PerformanceDashboard() {
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const fetchCacheInfo = async () => {
    try {
      setLoading(true);
      const info = await fiberDBClient.getCacheInfo();
      setCacheInfo(info);
    } catch (error) {
      console.error('Failed to fetch cache info:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    const healthy = await fiberDBClient.checkHealth();
    setIsOnline(healthy);
  };

  const clearCache = async () => {
    try {
      setClearingCache(true);
      await fiberDBClient.clearCache();
      await fetchCacheInfo(); // Refresh cache info
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setClearingCache(false);
    }
  };

  useEffect(() => {
    checkHealth();
    fetchCacheInfo();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      checkHealth();
      fetchCacheInfo();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isOnline === null
                    ? 'bg-gray-400'
                    : isOnline
                    ? 'bg-green-500'
                    : 'bg-red-500'
                }`}
              />
              <span className="font-medium">
                FiberDB API: {isOnline === null ? 'Checking...' : isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <Button onClick={checkHealth} size="sm" variant="outline">
              <RefreshCw className="w-4 h-4 mr-1" />
              Check
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Cache Performance
            </CardTitle>
            <div className="flex gap-2">
              <Button onClick={fetchCacheInfo} size="sm" variant="outline" disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={clearCache}
                size="sm"
                variant="destructive"
                disabled={clearingCache}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {clearingCache ? 'Clearing...' : 'Clear Cache'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {cacheInfo ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Document Cache</h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-blue-700">Size:</span>
                    <span className="font-mono text-blue-900">
                      {cacheInfo.documentCache.size} / {cacheInfo.documentCache.maxSize}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-blue-700">Hit Rate:</span>
                    <span className="font-mono text-blue-900">
                      {formatPercentage(cacheInfo.documentCache.hitRate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-blue-700">Hits/Misses:</span>
                    <span className="font-mono text-blue-900">
                      {cacheInfo.documentCache.hits} / {cacheInfo.documentCache.misses}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Query Cache</h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-green-700">Size:</span>
                    <span className="font-mono text-green-900">
                      {cacheInfo.queryCache.size} / {cacheInfo.queryCache.maxSize}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-green-700">Hit Rate:</span>
                    <span className="font-mono text-green-900">
                      {formatPercentage(cacheInfo.queryCache.hitRate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-green-700">Hits/Misses:</span>
                    <span className="font-mono text-green-900">
                      {cacheInfo.queryCache.hits} / {cacheInfo.queryCache.misses}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium text-purple-900 mb-2">File Check Cache</h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-purple-700">Size:</span>
                    <span className="font-mono text-purple-900">
                      {cacheInfo.fileCheckCache.size} / {cacheInfo.fileCheckCache.maxSize}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-purple-700">Hit Rate:</span>
                    <span className="font-mono text-purple-900">
                      {formatPercentage(cacheInfo.fileCheckCache.hitRate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-purple-700">Hits/Misses:</span>
                    <span className="font-mono text-purple-900">
                      {cacheInfo.fileCheckCache.hits} / {cacheInfo.fileCheckCache.misses}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              {loading ? 'Loading cache information...' : 'Failed to load cache information'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}