'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fiberDBClient, QueryOptions } from '@/lib/api';
import { Play, Settings, Loader2 } from 'lucide-react';

interface QueryBuilderProps {
  onResults: (results: any) => void;
  onError: (error: string) => void;
}

export function QueryBuilder({ onResults, onError }: QueryBuilderProps) {
  const [query, setQuery] = useState('{\n  "primary": "business-partner",\n  "limit": 10\n}');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<QueryOptions>({
    includePerformanceMetrics: true,
    skipCache: false,
    skipTTL: false,
    useParallel: false,
  });

  const handleExecute = async () => {
    try {
      setLoading(true);
      const queryBody = JSON.parse(query);
      const results = await fiberDBClient.query(queryBody, options);
      onResults(results);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Query execution failed');
    } finally {
      setLoading(false);
    }
  };

  const exampleQueries = [
    {
      name: 'Get All Business Partners',
      query: '{\n  "primary": "business-partner",\n  "skipTTL": true,\n  "limit": 10\n}',
    },
    {
      name: 'Filter by Customer Class',
      query: '{\n  "primary": "business-partner",\n  "filter": {\n    "customerClassification": "A"\n  },\n  "skipTTL": true,\n  "limit": 10\n}',
    },
    {
      name: 'Get Specific Fields',
      query: '{\n  "primary": "business-partner",\n  "include": ["firstName", "lastName", "customerClassification"],\n  "skipTTL": true,\n  "limit": 10\n}',
    },
    {
      name: 'Filter Addresses by Country',
      query: '{\n  "primary": "business-partner",\n  "include": ["firstName", "lastName", "addresses"],\n  "where": {\n    "addresses.country": "LB"\n  },\n  "skipTTL": true,\n  "limit": 10\n}',
    },
    {
      name: 'Get Single Entity by ID',
      query: '{\n  "primary": "business-partner",\n  "id": "BP01400152",\n  "skipTTL": true\n}',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Query Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Query JSON</label>
          <p className="text-xs text-gray-600 mb-2">
            Queries must include a "primary" field specifying the entity type (e.g., "business-partner").
            Use "skipTTL": true to access historical data.
          </p>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-40 p-3 border rounded-md font-mono text-sm"
            placeholder='{\n  "primary": "business-partner",\n  "skipTTL": true,\n  "limit": 10\n}'
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Example Queries</label>
          <div className="grid grid-cols-2 gap-2">
            {exampleQueries.map((example) => (
              <Button
                key={example.name}
                variant="outline"
                size="sm"
                onClick={() => setQuery(example.query)}
                className="text-left justify-start"
              >
                {example.name}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Query Options</label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={options.includePerformanceMetrics}
                onChange={(e) =>
                  setOptions({ ...options, includePerformanceMetrics: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-sm">Include Performance Metrics</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={options.skipCache}
                onChange={(e) => setOptions({ ...options, skipCache: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Skip Cache</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={options.skipTTL}
                onChange={(e) => setOptions({ ...options, skipTTL: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Skip TTL</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={options.useParallel}
                onChange={(e) => setOptions({ ...options, useParallel: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Use Parallel Processing</span>
            </label>
          </div>
        </div>

        <Button onClick={handleExecute} disabled={loading} className="w-full">
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Execute Query
        </Button>
      </CardContent>
    </Card>
  );
}