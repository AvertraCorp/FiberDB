import { Entity, Edge } from '../../../types/enhanced/entity';
import { EnhancedQueryParams, QueryResult, Path } from '../../../types/enhanced/query';

export interface IStorageEngine {
  initialize(): Promise<void>;
  
  // Entity operations
  saveEntity(entity: Entity): Promise<void>;
  getEntity(type: string, id: string): Promise<Entity | null>;
  deleteEntity(type: string, id: string): Promise<boolean>;
  getAllEntities(entityType: string): Promise<Entity[]>;
  
  // Edge operations
  addEdge(fromType: string, fromId: string, edge: Edge): Promise<void>;
  removeEdge(fromType: string, fromId: string, edgeId: string): Promise<boolean>;
  
  // Query operations
  query(params: EnhancedQueryParams): Promise<QueryResult>;
  findPaths(fromId: string, toId: string, maxDepth: number): Promise<Path[]>;
  
  // Utility operations
  getStats(): Promise<StorageStats>;
  close(): Promise<void>;
}

export interface StorageStats {
  totalEntities: number;
  totalEdges: number;
  storageSize: number;
  indexSize: number;
  cacheHitRate: number;
  averageQueryTime: number;
}