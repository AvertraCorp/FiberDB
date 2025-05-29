import { Entity, Edge } from '../../../types/enhanced/entity';
import { EnhancedQueryParams, QueryResult, Path } from '../../../types/enhanced/query';
import { IStorageEngine, StorageStats } from './storage-engine.interface';
import { WALManager } from '../wal/wal-manager';
import { LockManager } from '../concurrency/lock-manager';
import { IndexManager } from '../indexes/index-manager';

export class CustomStorageEngine implements IStorageEngine {
  private entities = new Map<string, Entity>();
  private walManager: WALManager;
  private lockManager: LockManager;
  private indexManager: IndexManager;
  private isInitialized = false;
  private backgroundWriteQueue = new Set<string>();
  private queryMetrics = {
    totalQueries: 0,
    totalTime: 0
  };

  constructor(private dataPath: string, private options: StorageEngineOptions = {}) {
    this.walManager = new WALManager(dataPath, options.compactionThreshold);
    this.lockManager = new LockManager();
    this.indexManager = new IndexManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing CustomStorageEngine...');
      
      // Replay WAL to restore state
      this.entities = await this.walManager.replay();
      console.log(`Restored ${this.entities.size} entities from WAL`);
      
      // Rebuild indexes
      await this.rebuildIndexes();
      console.log('Indexes rebuilt successfully');
      
      this.isInitialized = true;
      console.log('CustomStorageEngine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CustomStorageEngine:', error);
      throw new Error(`Storage engine initialization failed: ${error}`);
    }
  }

  async saveEntity(entity: Entity): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const entityKey = `${entity.type}:${entity.id}`;
    
    return this.lockManager.withWriteLock(entityKey, async () => {
      // Update metadata
      const now = new Date();
      entity.metadata.updated = now;
      if (!entity.metadata.created) {
        entity.metadata.created = now;
      }
      entity.metadata.version = (entity.metadata.version || 0) + 1;

      // Validate entity
      this.validateEntity(entity);

      // Write to WAL first for durability
      await this.walManager.writeEntry({
        timestamp: Date.now(),
        operation: this.entities.has(entityKey) ? 'UPDATE' : 'INSERT',
        entityType: entity.type,
        entityId: entity.id,
        data: entity
      });

      // Update in-memory
      this.entities.set(entityKey, entity);

      // Update indexes
      await this.indexManager.updateIndexes(entity);

      // Schedule background persistence
      this.scheduleBackgroundWrite(entityKey);
    });
  }

  async getEntity(type: string, id: string): Promise<Entity | null> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const entityKey = `${type}:${id}`;
    
    return this.lockManager.withReadLock(entityKey, async () => {
      return this.entities.get(entityKey) || null;
    });
  }

  async deleteEntity(type: string, id: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const entityKey = `${type}:${id}`;
    
    return this.lockManager.withWriteLock(entityKey, async () => {
      const entity = this.entities.get(entityKey);
      if (!entity) {
        return false;
      }

      // Write to WAL
      await this.walManager.writeEntry({
        timestamp: Date.now(),
        operation: 'DELETE',
        entityType: type,
        entityId: id
      });

      // Remove from indexes
      await this.indexManager.removeFromIndexes(entity);

      // Remove from memory
      this.entities.delete(entityKey);

      return true;
    });
  }

  async getAllEntities(entityType: string): Promise<Entity[]> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const entities: Entity[] = [];
    
    for (const [key, entity] of this.entities.entries()) {
      if (entity.type === entityType) {
        entities.push(entity);
      }
    }
    
    return entities;
  }

  async addEdge(fromType: string, fromId: string, edge: Edge): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const entityKey = `${fromType}:${fromId}`;
    
    return this.lockManager.withWriteLock(entityKey, async () => {
      const entity = this.entities.get(entityKey);
      if (!entity) {
        throw new Error(`Entity ${entityKey} not found`);
      }

      // Validate edge
      this.validateEdge(edge);

      // Check if edge already exists and remove it
      entity.edges = entity.edges.filter(e => e.id !== edge.id);

      // Write to WAL
      await this.walManager.writeEntry({
        timestamp: Date.now(),
        operation: 'ADD_EDGE',
        entityType: fromType,
        entityId: fromId,
        edgeData: edge
      });

      // Update in-memory
      entity.edges.push(edge);
      entity.metadata.updated = new Date();
      entity.metadata.version++;

      // Update indexes
      await this.indexManager.updateEdgeIndexes(entityKey, edge);
    });
  }

  async removeEdge(fromType: string, fromId: string, edgeId: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const entityKey = `${fromType}:${fromId}`;
    
    return this.lockManager.withWriteLock(entityKey, async () => {
      const entity = this.entities.get(entityKey);
      if (!entity) {
        return false;
      }

      const edgeIndex = entity.edges.findIndex(e => e.id === edgeId);
      if (edgeIndex === -1) {
        return false;
      }

      const removedEdge = entity.edges[edgeIndex];

      // Write to WAL
      await this.walManager.writeEntry({
        timestamp: Date.now(),
        operation: 'REMOVE_EDGE',
        entityType: fromType,
        entityId: fromId,
        edgeData: removedEdge
      });

      // Update in-memory
      entity.edges.splice(edgeIndex, 1);
      entity.metadata.updated = new Date();
      entity.metadata.version++;

      return true;
    });
  }

  async query(params: EnhancedQueryParams): Promise<QueryResult> {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }

    const startTime = Date.now();
    
    try {
      // Use indexes when possible
      const candidateIds = await this.indexManager.findCandidates(params);
      
      // Apply filters
      const results = await this.applyFilters(candidateIds, params);
      
      // Handle graph traversal
      if (params.traverse) {
        return this.executeGraphTraversal(results, params.traverse);
      }
      
      // Apply pagination
      const offset = params.offset || 0;
      const limit = params.limit;
      const paginatedResults = limit 
        ? results.slice(offset, offset + limit)
        : results.slice(offset);

      const result: QueryResult = {
        entities: paginatedResults,
        metadata: {
          total: results.length,
          offset,
          limit,
          executionTime: Date.now() - startTime
        }
      };

      // Update metrics
      this.queryMetrics.totalQueries++;
      this.queryMetrics.totalTime += result.metadata.executionTime!;

      return result;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw new Error(`Query failed: ${error}`);
    }
  }

  async findPaths(fromId: string, toId: string, maxDepth: number = 3): Promise<Path[]> {
    const paths: Path[] = [];
    const visited = new Set<string>();
    
    await this.dfsPathFinding(fromId, toId, [], [], maxDepth, visited, paths);
    
    return paths.sort((a, b) => a.length - b.length);
  }

  private async dfsPathFinding(
    currentId: string,
    targetId: string,
    currentPath: string[],
    currentEdges: string[],
    remainingDepth: number,
    visited: Set<string>,
    foundPaths: Path[]
  ): Promise<void> {
    if (remainingDepth <= 0 || visited.has(currentId)) {
      return;
    }

    currentPath.push(currentId);
    visited.add(currentId);

    if (currentId === targetId) {
      foundPaths.push({
        nodes: [...currentPath],
        edges: [...currentEdges],
        length: currentPath.length - 1,
        weight: currentEdges.length
      });
    } else {
      // Find entity and traverse its edges
      const [type, id] = currentId.split(':');
      const entity = await this.getEntity(type, id);
      
      if (entity) {
        for (const edge of entity.edges) {
          if (!visited.has(edge.target)) {
            await this.dfsPathFinding(
              edge.target,
              targetId,
              currentPath,
              [...currentEdges, edge.id],
              remainingDepth - 1,
              visited,
              foundPaths
            );
          }
        }
      }
    }

    currentPath.pop();
    visited.delete(currentId);
  }

  private async applyFilters(candidateIds: string[], params: EnhancedQueryParams): Promise<any[]> {
    const results: any[] = [];
    const entityTypes = Array.isArray(params.from) ? params.from : [params.from];
    
    // If no candidates from indexes, scan all entities of the specified types
    const entitiesToCheck = candidateIds.length > 0 
      ? candidateIds 
      : this.getAllEntitiesOfTypes(entityTypes);

    for (const entityKey of entitiesToCheck) {
      const entity = this.entities.get(entityKey);
      if (!entity) continue;

      if (this.matchesFilter(entity, params.where)) {
        // Apply field selection
        const result = this.selectFields(entity, params.include, params.exclude);
        results.push(result);
      }
    }

    return results;
  }

  private getAllEntitiesOfTypes(types: string[]): string[] {
    const entityKeys: string[] = [];
    
    for (const [key, entity] of this.entities.entries()) {
      if (types.includes(entity.type)) {
        entityKeys.push(key);
      }
    }
    
    return entityKeys;
  }

  private matchesFilter(entity: Entity, where?: any): boolean {
    if (!where) return true;

    // Check attribute filters
    if (where.attributes) {
      for (const [field, condition] of Object.entries(where.attributes)) {
        // Special handling for ID field - check both entity.id and entity.attributes.id
        let value;
        if (field === 'id') {
          value = entity.id || entity.attributes[field];
        } else {
          value = entity.attributes[field];
        }
        
        if (!this.matchesCondition(value, condition)) {
          return false;
        }
      }
    }

    // Check document filters
    if (where.documents) {
      for (const [docType, condition] of Object.entries(where.documents)) {
        const docs = entity.documents[docType];
        if (!docs || !this.matchesCondition(docs, condition)) {
          return false;
        }
      }
    }

    // Check edge filters
    if (where.edges) {
      const hasMatchingEdge = entity.edges.some(edge => {
        if (where.edges.type && !this.matchesCondition(edge.type, where.edges.type)) {
          return false;
        }
        if (where.edges.target && !this.matchesCondition(edge.target, where.edges.target)) {
          return false;
        }
        if (where.edges.properties) {
          for (const [prop, value] of Object.entries(where.edges.properties)) {
            if (!this.matchesCondition(edge.properties?.[prop], value)) {
              return false;
            }
          }
        }
        return true;
      });
      
      if (!hasMatchingEdge) {
        return false;
      }
    }

    return true;
  }

  private matchesCondition(value: any, condition: any): boolean {
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      if (condition.$eq !== undefined) return value === condition.$eq;
      if (condition.$ne !== undefined) return value !== condition.$ne;
      if (condition.$gt !== undefined) return value > condition.$gt;
      if (condition.$gte !== undefined) return value >= condition.$gte;
      if (condition.$lt !== undefined) return value < condition.$lt;
      if (condition.$lte !== undefined) return value <= condition.$lte;
      if (condition.$in !== undefined) return condition.$in.includes(value);
      if (condition.$nin !== undefined) return !condition.$nin.includes(value);
      if (condition.$exists !== undefined) return (value !== undefined) === condition.$exists;
    }
    
    return value === condition;
  }

  private selectFields(entity: Entity, include?: string[], exclude?: string[]): any {
    let result: any = { ...entity };

    if (include) {
      // If '*' is included, return the whole entity
      if (include.includes('*')) {
        result = { ...entity };
      } else {
        result = {};
        for (const field of include) {
          if (field.includes('.')) {
            // Handle nested fields
            const [parent, child] = field.split('.');
            if (!result[parent]) result[parent] = {};
            result[parent][child] = (entity as any)[parent]?.[child];
          } else {
            result[field] = (entity as any)[field];
          }
        }
      }
    }

    if (exclude) {
      for (const field of exclude) {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (result[parent]) {
            delete result[parent][child];
          }
        } else {
          delete result[field];
        }
      }
    }

    return result;
  }

  private async executeGraphTraversal(startEntities: any[], traversal: any): Promise<QueryResult> {
    // Simplified graph traversal implementation
    const visited = new Set<string>();
    const results = [...startEntities];

    for (const entity of startEntities) {
      await this.traverseFromEntity(entity, traversal, visited, results, traversal.maxDepth || 3);
    }

    return {
      entities: results,
      metadata: { total: results.length }
    };
  }

  private async traverseFromEntity(
    entity: any,
    traversal: any,
    visited: Set<string>,
    results: any[],
    remainingDepth: number
  ): Promise<void> {
    if (remainingDepth <= 0) return;

    const entityKey = `${entity.type}:${entity.id}`;
    if (visited.has(entityKey)) return;

    visited.add(entityKey);

    for (const edge of entity.edges || []) {
      if (traversal.edgeTypes && !traversal.edgeTypes.includes(edge.type)) {
        continue;
      }

      const [targetType, targetId] = edge.target.split(':');
      const targetEntity = await this.getEntity(targetType, targetId);
      
      if (targetEntity && !visited.has(edge.target)) {
        results.push(targetEntity);
        await this.traverseFromEntity(targetEntity, traversal, visited, results, remainingDepth - 1);
      }
    }
  }

  private validateEntity(entity: Entity): void {
    if (!entity.id || !entity.type) {
      throw new Error('Entity must have id and type');
    }
    
    if (!entity.attributes) {
      entity.attributes = {};
    }
    
    if (!entity.documents) {
      entity.documents = {};
    }
    
    if (!entity.edges) {
      entity.edges = [];
    }
  }

  private validateEdge(edge: Edge): void {
    if (!edge.id || !edge.type || !edge.target) {
      throw new Error('Edge must have id, type, and target');
    }
  }

  private async rebuildIndexes(): Promise<void> {
    console.log('Rebuilding indexes...');
    
    for (const entity of this.entities.values()) {
      await this.indexManager.updateIndexes(entity);
    }
    
    console.log('Index rebuild completed');
  }

  private scheduleBackgroundWrite(entityKey: string): void {
    this.backgroundWriteQueue.add(entityKey);
    
    // Process queue periodically (simplified implementation)
    setTimeout(() => {
      this.processBackgroundWrites();
    }, 1000);
  }

  private async processBackgroundWrites(): Promise<void> {
    if (this.backgroundWriteQueue.size === 0) return;

    const entitiesToWrite = Array.from(this.backgroundWriteQueue);
    this.backgroundWriteQueue.clear();

    // In a real implementation, this would write to persistent storage
    // For now, we rely on WAL for persistence
    console.log(`Processed ${entitiesToWrite.length} background writes`);
  }

  async getStats(): Promise<StorageStats> {
    const walStats = await this.walManager.getStats();
    const lockStats = this.lockManager.getLockStats();
    const indexStats = this.indexManager.getIndexStats();

    let totalEdges = 0;
    for (const entity of this.entities.values()) {
      totalEdges += entity.edges.length;
    }

    return {
      totalEntities: this.entities.size,
      totalEdges,
      storageSize: walStats.walSizeBytes,
      indexSize: Object.values(indexStats).reduce((sum, stat) => sum + stat.memoryUsage, 0),
      cacheHitRate: 0.95, // Simplified - would track actual cache hits
      averageQueryTime: this.queryMetrics.totalQueries > 0 
        ? this.queryMetrics.totalTime / this.queryMetrics.totalQueries 
        : 0
    };
  }

  async close(): Promise<void> {
    console.log('Closing CustomStorageEngine...');
    
    // Force any pending WAL writes
    await this.walManager.compact();
    
    // Clear in-memory data
    this.entities.clear();
    
    this.isInitialized = false;
    console.log('CustomStorageEngine closed');
  }
}

export interface StorageEngineOptions {
  compactionThreshold?: number;
  enableBackgroundProcessing?: boolean;
  cacheSize?: number;
}