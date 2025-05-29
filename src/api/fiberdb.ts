import { Entity, Edge } from '../types/enhanced/entity';
import { EnhancedQueryParams, QueryResult, GraphQueryParams, GraphResult, Path } from '../types/enhanced/query';
import { CustomStorageEngine } from '../core/storage/engines/custom-storage-engine';
import { QueryOptions, StorageOptions } from '../types';
import { encrypt, decrypt } from '../core/crypto';
import config from '../config';

export class FiberDB {
  private engine: CustomStorageEngine;
  private isInitialized = false;

  constructor(dataPath: string = config.storage.baseDir) {
    this.engine = new CustomStorageEngine(dataPath, {
      compactionThreshold: 1000,
      enableBackgroundProcessing: true,
      cacheSize: 10000
    });
  }

  async initialize(): Promise<void> {
    if (!this.isInitialized) {
      await this.engine.initialize();
      this.isInitialized = true;
    }
  }

  // ===== EXISTING API (MAINTAINED FOR BACKWARD COMPATIBILITY) =====
  
  async saveAnchor(type: string, id: string, data: any, options?: StorageOptions): Promise<void> {
    await this.initialize();
    
    // Convert to new entity format
    const entity: Entity = {
      id,
      type,
      attributes: { ...data },
      documents: {},
      edges: [],
      metadata: {
        created: new Date(),
        updated: new Date(),
        version: 1,
        schemaVersion: 1
      }
    };

    // Handle encryption
    if (options?.secureFields && options.key) {
      entity.attributes = await this.encryptFields(
        entity.attributes,
        options.secureFields,
        options.key
      );
    }

    await this.engine.saveEntity(entity);
  }

  async attachToAnchor(anchorId: string, attachmentType: string, data: any, options?: StorageOptions): Promise<void> {
    await this.initialize();
    
    // Parse anchorId to get type and id
    const parts = anchorId.split(':');
    const type = parts.length > 1 ? parts[0] : 'unknown';
    const id = parts.length > 1 ? parts[1] : anchorId;
    
    const entity = await this.engine.getEntity(type, id);
    if (!entity) {
      throw new Error(`Entity ${anchorId} not found`);
    }

    // Handle encryption
    let processedData = data;
    if (options?.secureFields && options.key) {
      processedData = await this.encryptFields(data, options.secureFields, options.key);
    }

    // Add to documents
    if (!entity.documents[attachmentType]) {
      entity.documents[attachmentType] = [];
    }
    entity.documents[attachmentType].push(processedData);

    await this.engine.saveEntity(entity);
  }

  async query(params: QueryOptions): Promise<any> {
    await this.initialize();
    
    // Convert old query format to new format
    const enhancedParams = this.convertLegacyQuery(params);
    const result = await this.engine.query(enhancedParams);
    
    // Convert back to legacy format
    return this.convertToLegacyResult(result, params);
  }

  // ===== NEW API (ENHANCED CAPABILITIES) =====

  async saveEntity(entity: Entity): Promise<void> {
    await this.initialize();
    return this.engine.saveEntity(entity);
  }

  async getEntity(type: string, id: string): Promise<Entity | null> {
    await this.initialize();
    return this.engine.getEntity(type, id);
  }

  async deleteEntity(type: string, id: string): Promise<boolean> {
    await this.initialize();
    return this.engine.deleteEntity(type, id);
  }

  async addRelationship(
    fromType: string, 
    fromId: string, 
    toType: string, 
    toId: string, 
    relationshipType: string, 
    properties?: any
  ): Promise<void> {
    await this.initialize();
    
    const edge: Edge = {
      id: `${fromId}_${relationshipType}_${toId}`,
      type: relationshipType,
      target: `${toType}:${toId}`,
      properties
    };

    await this.engine.addEdge(fromType, fromId, edge);
  }

  async removeRelationship(
    fromType: string, 
    fromId: string, 
    relationshipType: string, 
    toId: string
  ): Promise<boolean> {
    await this.initialize();
    
    const edgeId = `${fromId}_${relationshipType}_${toId}`;
    return this.engine.removeEdge(fromType, fromId, edgeId);
  }

  async findPath(fromId: string, toId: string, maxDepth: number = 3): Promise<Path[]> {
    await this.initialize();
    return this.engine.findPaths(fromId, toId, maxDepth);
  }

  async queryGraph(params: GraphQueryParams): Promise<GraphResult> {
    await this.initialize();
    
    const enhancedParams: EnhancedQueryParams = {
      from: [], // Will be populated by graph traversal
      traverse: {
        direction: params.traversal.direction,
        edgeTypes: params.traversal.edgeTypes,
        maxDepth: params.traversal.maxDepth,
        pathFilter: params.traversal.nodeFilter
      }
    };

    // Start from specified nodes
    const results: any[] = [];
    const visited = new Set<string>();

    for (const startNodeId of params.startNodes) {
      const [type, id] = startNodeId.split(':');
      const startEntity = await this.getEntity(type, id);
      
      if (startEntity) {
        results.push(startEntity);
        await this.traverseFromNode(startEntity, params.traversal, visited, results, params.traversal.maxDepth);
      }
    }

    return {
      nodes: params.returnType === 'NODES' ? results : undefined,
      paths: params.returnType === 'PATHS' ? await this.extractPaths(results) : undefined,
      edges: params.returnType === 'EDGES' ? this.extractEdges(results) : undefined,
      metadata: {
        total: results.length,
        executionTime: 0 // Would be measured in real implementation
      }
    };
  }

  async enhancedQuery(params: EnhancedQueryParams): Promise<QueryResult> {
    await this.initialize();
    return this.engine.query(params);
  }

  // ===== UTILITY METHODS =====

  private convertLegacyQuery(params: QueryOptions): EnhancedQueryParams {
    const enhancedParams: EnhancedQueryParams = {
      from: params.primary,
      include: params.include,
      useCache: !params.skipCache,
      useParallel: params.useParallel
    };

    // Convert filters
    if (params.filter || params.where) {
      enhancedParams.where = {};
      
      if (params.filter) {
        enhancedParams.where.attributes = params.filter;
      }
      
      if (params.where) {
        enhancedParams.where.documents = params.where;
      }
    }

    // Handle specific entity ID
    if (params.id) {
      if (!enhancedParams.where) {
        enhancedParams.where = {};
      }
      enhancedParams.where.attributes = {
        ...enhancedParams.where.attributes,
        id: params.id
      };
    }

    return enhancedParams;
  }

  private convertToLegacyResult(result: QueryResult, originalParams: QueryOptions): any {
    // Convert entities back to legacy anchor/attachment format
    const legacyResults = result.entities.map(entity => {
      const anchor = {
        id: entity.id,
        type: entity.type,
        ...entity.attributes
      };

      // Handle decryption if needed
      if (originalParams.decryptionKey && anchor.__secure) {
        for (const field of anchor.__secure) {
          if (anchor[field]) {
            try {
              anchor[field] = decrypt(anchor[field], originalParams.decryptionKey);
            } catch (error) {
              console.warn(`Failed to decrypt field ${field}: ${error}`);
            }
          }
        }
        delete anchor.__secure;
      }

      // Add attachments as separate property
      const attachments: Record<string, any[]> = {};
      if (entity.documents) {
        for (const [docType, docs] of Object.entries(entity.documents)) {
          attachments[docType] = docs.map(doc => {
            // Handle decryption for attachments
            if (originalParams.decryptionKey && doc.__secure) {
              const decryptedDoc = { ...doc };
              for (const field of doc.__secure) {
                if (decryptedDoc[field]) {
                  try {
                    decryptedDoc[field] = decrypt(decryptedDoc[field], originalParams.decryptionKey);
                  } catch (error) {
                    console.warn(`Failed to decrypt attachment field ${field}: ${error}`);
                  }
                }
              }
              delete decryptedDoc.__secure;
              return decryptedDoc;
            }
            return doc;
          });
        }
      }

      return {
        anchor,
        attachments: Object.keys(attachments).length > 0 ? attachments : undefined
      };
    });

    return legacyResults;
  }

  private async encryptFields(data: any, secureFields: string[], key: string): Promise<any> {
    const encrypted = { ...data };
    
    for (const field of secureFields) {
      if (encrypted[field]) {
        encrypted[field] = encrypt(encrypted[field], key);
      }
    }
    
    encrypted.__secure = secureFields;
    return encrypted;
  }

  private async traverseFromNode(
    entity: Entity,
    traversal: any,
    visited: Set<string>,
    results: any[],
    remainingDepth: number
  ): Promise<void> {
    if (remainingDepth <= 0) return;

    const entityKey = `${entity.type}:${entity.id}`;
    if (visited.has(entityKey)) return;

    visited.add(entityKey);

    for (const edge of entity.edges) {
      // Apply edge filter
      if (traversal.edgeTypes && !traversal.edgeTypes.includes(edge.type)) {
        continue;
      }

      if (traversal.edgeFilter && !this.matchesEdgeFilter(edge, traversal.edgeFilter)) {
        continue;
      }

      const [targetType, targetId] = edge.target.split(':');
      const targetEntity = await this.getEntity(targetType, targetId);
      
      if (targetEntity && !visited.has(edge.target)) {
        // Apply node filter
        if (!traversal.nodeFilter || this.matchesNodeFilter(targetEntity, traversal.nodeFilter)) {
          results.push(targetEntity);
          await this.traverseFromNode(targetEntity, traversal, visited, results, remainingDepth - 1);
        }
      }
    }
  }

  private matchesEdgeFilter(edge: Edge, filter: any): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (key === 'type' && edge.type !== value) return false;
      if (key === 'weight' && edge.weight !== value) return false;
      if (edge.properties && key in edge.properties && edge.properties[key] !== value) return false;
    }
    return true;
  }

  private matchesNodeFilter(entity: Entity, filter: any): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (key === 'type' && entity.type !== value) return false;
      if (entity.attributes[key] !== value) return false;
    }
    return true;
  }

  private async extractPaths(entities: Entity[]): Promise<Path[]> {
    // Simplified path extraction - in a real implementation,
    // this would maintain actual path information during traversal
    const paths: Path[] = [];
    
    for (let i = 0; i < entities.length - 1; i++) {
      const fromEntity = entities[i];
      const toEntity = entities[i + 1];
      
      // Check if there's a direct edge
      const edge = fromEntity.edges.find(e => e.target === `${toEntity.type}:${toEntity.id}`);
      if (edge) {
        paths.push({
          nodes: [`${fromEntity.type}:${fromEntity.id}`, `${toEntity.type}:${toEntity.id}`],
          edges: [edge.id],
          length: 1,
          weight: edge.weight || 1
        });
      }
    }
    
    return paths;
  }

  private extractEdges(entities: Entity[]): Edge[] {
    const edges: Edge[] = [];
    
    for (const entity of entities) {
      edges.push(...entity.edges);
    }
    
    return edges;
  }

  async getStats(): Promise<any> {
    await this.initialize();
    return this.engine.getStats();
  }

  async close(): Promise<void> {
    if (this.isInitialized) {
      await this.engine.close();
      this.isInitialized = false;
    }
  }
}

// Create default instance
export const defaultFiberDB = new FiberDB();

// Export legacy functions for backward compatibility
export async function saveAnchor(type: string, id: string, data: any, options?: StorageOptions): Promise<void> {
  return defaultFiberDB.saveAnchor(type, id, data, options);
}

export async function attachToAnchor(anchorId: string, attachmentType: string, data: any, options?: StorageOptions): Promise<void> {
  return defaultFiberDB.attachToAnchor(anchorId, attachmentType, data, options);
}

export async function query(params: QueryOptions): Promise<any> {
  return defaultFiberDB.query(params);
}

// Export new enhanced functions
export async function saveEntity(entity: Entity): Promise<void> {
  return defaultFiberDB.saveEntity(entity);
}

export async function getEntity(type: string, id: string): Promise<Entity | null> {
  return defaultFiberDB.getEntity(type, id);
}

export async function addRelationship(
  fromType: string, 
  fromId: string, 
  toType: string, 
  toId: string, 
  relationshipType: string, 
  properties?: any
): Promise<void> {
  return defaultFiberDB.addRelationship(fromType, fromId, toType, toId, relationshipType, properties);
}

export async function enhancedQuery(params: EnhancedQueryParams): Promise<QueryResult> {
  return defaultFiberDB.enhancedQuery(params);
}

export async function queryGraph(params: GraphQueryParams): Promise<GraphResult> {
  return defaultFiberDB.queryGraph(params);
}