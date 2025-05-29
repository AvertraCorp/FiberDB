'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, FileText, BarChart3 } from 'lucide-react';
import { formatDuration, formatBytes } from '@/lib/utils';

interface ResultsViewerProps {
  results: any;
}

export function ResultsViewer({ results }: ResultsViewerProps) {
  const [viewMode, setViewMode] = useState<'table' | 'json' | 'metrics'>('table');

  if (!results) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          Execute a query to see results here
        </CardContent>
      </Card>
    );
  }

  // FiberDB returns an array directly, not wrapped in { data: [...] }
  const data = Array.isArray(results) ? results : results?.data;
  const { metadata, performanceMetrics } = results || {};

  const renderTable = () => {
    if (!data || data.length === 0) {
      return <div className="p-4 text-center text-gray-500">No data found</div>;
    }

    // Filter out internal fields and get primary columns
    const allColumns = Object.keys(data[0]);
    const primaryColumns = allColumns.filter(col => 
      !col.startsWith('__') && 
      !Array.isArray(data[0][col]) && 
      typeof data[0][col] !== 'object'
    );
    
    // Add a few key array columns for preview
    const arrayColumns = allColumns.filter(col => Array.isArray(data[0][col]));
    
    const displayColumns = [...primaryColumns.slice(0, 8), ...arrayColumns.slice(0, 2)];

    return (
      <div className="overflow-auto max-h-96">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {displayColumns.map((column) => (
                <th key={column} className="p-2 text-left font-medium text-xs">
                  {column.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, index: number) => (
              <tr key={index} className="border-b hover:bg-gray-50">
                {displayColumns.map((column) => (
                  <td key={column} className="p-2 max-w-xs">
                    {Array.isArray(row[column]) ? (
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {row[column].length} items
                      </span>
                    ) : typeof row[column] === 'object' && row[column] !== null ? (
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        Object
                      </span>
                    ) : (
                      <span className="truncate block max-w-32" title={String(row[column] ?? '')}>
                        {String(row[column] ?? '')}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        
        {allColumns.length > displayColumns.length && (
          <div className="p-2 text-xs text-gray-500 bg-gray-50 border-t">
            Showing {displayColumns.length} of {allColumns.length} columns. 
            Switch to JSON view to see all data.
          </div>
        )}
      </div>
    );
  };

  const renderJSON = () => (
    <pre className="bg-gray-50 p-4 rounded overflow-auto max-h-96 text-sm">
      {JSON.stringify(results, null, 2)}
    </pre>
  );

  const renderMetrics = () => {
    // Check if we have metrics in the first result item
    const metricsData = data?.[0]?.__metrics;
    const recordsStats = metricsData?.details?.recordsStats;
    
    return (
      <div className="space-y-4">
        {metricsData && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded">
              <div className="text-sm text-blue-600">Records Returned</div>
              <div className="text-2xl font-bold text-blue-900">
                {recordsStats?.returned?.toLocaleString() ?? data?.length ?? 0}
              </div>
              {recordsStats?.processed && (
                <div className="text-xs text-blue-600 mt-1">
                  {recordsStats.processed} processed, {recordsStats.filtered} filtered
                </div>
              )}
            </div>
            <div className="p-4 bg-green-50 rounded">
              <div className="text-sm text-green-600">Execution Time</div>
              <div className="text-2xl font-bold text-green-900">
                {formatDuration(metricsData.duration)}
              </div>
            </div>
            <div className="p-4 bg-purple-50 rounded">
              <div className="text-sm text-purple-600">Cache Status</div>
              <div className="text-2xl font-bold text-purple-900">
                {metricsData.details?.queryCacheHit ? 'HIT' : 'MISS'}
              </div>
            </div>
          </div>
        )}

        {metricsData && (
          <div className="space-y-3">
            <h4 className="font-medium">Performance Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Files Processed</div>
                <div className="font-bold">{metricsData.details?.filesCount ?? 0}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Attachments Loaded</div>
                <div className="font-bold">{metricsData.details?.attachmentsProcessed ?? 0}</div>
              </div>
              {metricsData.details?.ttlFiltered && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">TTL Filtered</div>
                  <div className="font-bold">{metricsData.details.ttlFiltered}</div>
                </div>
              )}
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Operation</div>
                <div className="font-bold text-sm">{metricsData.operation}</div>
              </div>
            </div>
            
            {metricsData.details?.phases && (
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600 mb-2">Query Phases</div>
                <div className="space-y-1 text-xs">
                  {Object.entries(metricsData.details.phases)
                    .filter(([key]) => !key.startsWith('loadFile:') && !key.startsWith('attachment:'))
                    .map(([phase, data]: [string, any]) => (
                      <div key={phase} className="flex justify-between">
                        <span className="capitalize">{phase.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="font-mono">{formatDuration(data.duration)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Query Results</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <Table className="w-4 h-4 mr-1" />
              Table
            </Button>
            <Button
              variant={viewMode === 'json' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('json')}
            >
              <FileText className="w-4 h-4 mr-1" />
              JSON
            </Button>
            <Button
              variant={viewMode === 'metrics' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('metrics')}
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Metrics
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'table' && renderTable()}
        {viewMode === 'json' && renderJSON()}
        {viewMode === 'metrics' && renderMetrics()}
      </CardContent>
    </Card>
  );
}