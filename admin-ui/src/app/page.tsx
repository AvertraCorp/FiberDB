'use client';

import { useState } from 'react';
import { QueryBuilder } from '@/components/query-builder';
import { ResultsViewer } from '@/components/results-viewer';
import { PerformanceDashboard } from '@/components/performance-dashboard';
import { Database, BarChart3, Search } from 'lucide-react';

export default function Home() {
  const [results, setResults] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'query' | 'performance'>('query');

  const handleResults = (newResults: any) => {
    setResults(newResults);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setResults(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">FiberDB Admin</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab('query')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'query'
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Search className="w-4 h-4" />
                Query Explorer
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'performance'
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Performance
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'query' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <QueryBuilder onResults={handleResults} onError={handleError} />
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <div className="text-red-800 font-medium">Error</div>
                  <div className="text-red-700 text-sm mt-1">{error}</div>
                </div>
              )}
            </div>
            <div>
              <ResultsViewer results={results} />
            </div>
          </div>
        )}

        {activeTab === 'performance' && <PerformanceDashboard />}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-gray-500 text-sm">
            FiberDB Admin UI - Built with Next.js 15
          </div>
        </div>
      </footer>
    </div>
  );
}
