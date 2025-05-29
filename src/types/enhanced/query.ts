export interface EnhancedQueryParams {
  // Entity selection
  from: string | string[];
  where?: {
    attributes?: Record<string, any>;
    documents?: Record<string, any>;
    edges?: EdgeFilter;
  };
  
  // Field selection
  include?: string[];
  exclude?: string[];
  
  // Graph traversal
  traverse?: {
    direction: "OUT" | "IN" | "BOTH";
    edgeTypes?: string[];
    maxDepth?: number;
    pathFilter?: Record<string, any>;
  };
  
  // Aggregation
  groupBy?: string[];
  aggregate?: Record<string, AggregateFunction>;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Performance
  useCache?: boolean;
  useParallel?: boolean;
  includeMetrics?: boolean;
}

export interface GraphQueryParams {
  startNodes: string[];
  traversal: {
    direction: "OUT" | "IN" | "BOTH";
    edgeTypes?: string[];
    maxDepth: number;
    nodeFilter?: Record<string, any>;
    edgeFilter?: Record<string, any>;
  };
  returnType: "NODES" | "PATHS" | "EDGES";
}

export interface EdgeFilter {
  type?: string | string[];
  target?: string | string[];
  properties?: Record<string, any>;
  weight?: {
    min?: number;
    max?: number;
  };
}

export interface QueryResult {
  entities: any[];
  metadata: {
    total: number;
    offset?: number;
    limit?: number;
    executionTime?: number;
  };
}

export interface GraphResult {
  nodes?: any[];
  paths?: Path[];
  edges?: any[];
  metadata: {
    total: number;
    executionTime?: number;
  };
}

export interface Path {
  nodes: string[];
  edges: string[];
  length: number;
  weight?: number;
}

export type AggregateFunction = 
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | { function: string; field: string };