/**
 * Dual Storage Engine
 * 
 * Integrates entity-based storage with optional columnar storage,
 * providing automatic query routing and transparent dual-storage
 * synchronization while maintaining full backward compatibility.
 */

import { CustomStorageEngine } from './custom-storage-engine';
import { IStorageEngine } from './storage-engine.interface';
import { ColumnStore } from '../columnar/column-store';
import { SmartQueryRouter, StorageExecutor } from '../../query/smart-router';
import {
  ColumnarConfig,
  ColumnarEntityConfig,
  EnhancedQueryResult,
  ConsistencyReport,
  ColumnarMetrics
} from '../../../types/enhanced/columnar';
import { Entity, QueryParams, QueryResult } from '../../../types';
import { EnhancedQueryParams } from '../../../types/enhanced/query';
import * as path from 'path';
import * as fs from 'fs/promises';

export class DualStorageEngine implements IStorageEngine, StorageExecutor {
  private entityEngine: CustomStorageEngine;
  private columnStore: ColumnStore;
  private smartRouter: SmartQueryRouter;
  private config: ColumnarConfig;
  private isInitialized = false;

  constructor(
    basePath: string,
    entityEngineOptions: any = {},
    columnarConfig: Partial<ColumnarConfig> = {}
  ) {
    // Initialize entity storage engine (primary storage)
    this.entityEngine = new CustomStorageEngine(basePath, entityEngineOptions);

    // Initialize columnar storage configuration
    this.config = {
      enabled: false,
      entityTypes: new Map(),
      keepOriginalFormat: true,
      autoRouting: true,
      basePath: path.join(basePath, 'columnar'),
      compression: {
        enabled: true,
        algorithm: 'gzip',
        level: 6
      },
      performance: {
        maxMemoryUsage: 512 * 1024 * 1024, // 512MB
        cacheSize: 100,
        backgroundSyncEnabled: true
      },
      ...columnarConfig
    };

    // Initialize column store
    this.columnStore = new ColumnStore(
      this.config.basePath,
      this.config.performance.cacheSize
    );

    // Initialize smart query router
    this.smartRouter = new SmartQueryRouter(
      this.columnStore,
      this, // DualStorageEngine implements StorageExecutor
      this.config.entityTypes,
      false // Metrics disabled by default
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize entity engine first
    await this.entityEngine.initialize();

    // Create columnar storage directory if it doesn't exist
    await fs.mkdir(this.config.basePath, { recursive: true });

    // Initialize existing entity type configurations
    for (const [entityType, config] of this.config.entityTypes) {
      await this.columnStore.initializeEntityType(entityType, config);
    }

    this.isInitialized = true;
  }

  // ===== COLUMNAR STORAGE CONFIGURATION API =====

  /**
   * Enable columnar storage for a specific entity type
   */
  async enableColumnarStorage(entityType: string, config: ColumnarEntityConfig): Promise<void> {
    await this.initialize();

    // Add to configuration
    this.config.entityTypes.set(entityType, config);
    this.config.enabled = true;

    // Initialize columnar storage for this entity type
    await this.columnStore.initializeEntityType(entityType, config);

    // Update smart router configuration
    this.smartRouter.updateColumnarConfigs(this.config.entityTypes);

    // Backfill existing entities if any
    await this.backfillColumnarStorage(entityType, config);
  }

  /**
   * Disable columnar storage for a specific entity type
   */
  async disableColumnarStorage(entityType: string): Promise<void> {
    if (!this.config.entityTypes.has(entityType)) {
      return; // Not configured
    }

    // Remove from configuration
    this.config.entityTypes.delete(entityType);

    // Update smart router configuration
    this.smartRouter.updateColumnarConfigs(this.config.entityTypes);

    // Disable globally if no entity types are configured
    if (this.config.entityTypes.size === 0) {
      this.config.enabled = false;
    }

    // Note: We don't delete columnar data immediately for safety
    // This could be added as a separate cleanup operation
  }

  /**
   * Add columns to existing columnar configuration
   */
  async addColumnarColumns(entityType: string, columns: string[]): Promise<void> {
    const config = this.config.entityTypes.get(entityType);
    if (!config) {
      throw new Error(`Columnar storage not configured for entity type: ${entityType}`);
    }

    // Add new columns to configuration
    const existingColumns = new Set(config.columns);
    const newColumns = columns.filter(col => !existingColumns.has(col));
    
    if (newColumns.length === 0) {
      return; // No new columns to add
    }

    config.columns.push(...newColumns);
    this.config.entityTypes.set(entityType, config);

    // Initialize new columns in column store
    for (const column of newColumns) {
      await this.columnStore.initializeEntityType(entityType, { 
        ...config, 
        columns: [column] // Initialize one column at a time
      });
    }

    // Backfill new columns with existing entity data
    await this.backfillColumnarColumns(entityType, newColumns);

    // Update smart router configuration
    this.smartRouter.updateColumnarConfigs(this.config.entityTypes);
  }

  /**
   * Remove columns from columnar configuration
   */
  async removeColumnarColumns(entityType: string, columns: string[]): Promise<void> {
    const config = this.config.entityTypes.get(entityType);
    if (!config) {
      return;
    }

    // Remove columns from configuration
    config.columns = config.columns.filter(col => !columns.includes(col));
    config.indexes = config.indexes.filter(idx => !columns.includes(idx));
    
    this.config.entityTypes.set(entityType, config);

    // Update smart router configuration
    this.smartRouter.updateColumnarConfigs(this.config.entityTypes);

    // Note: Actual column data cleanup could be added here
  }

  // ===== ENTITY STORAGE OPERATIONS (IStorageEngine interface) =====

  async saveEntity(entity: Entity): Promise<void> {
    await this.initialize();

    // Always save to entity store first (primary storage)
    await this.entityEngine.saveEntity(entity);

    // Sync to columnar store if configured for this entity type
    if (this.config.enabled && this.config.entityTypes.has(entity.type)) {
      const config = this.config.entityTypes.get(entity.type)!;
      
      if (config.autoSync) {
        if (config.syncMode === 'immediate') {
          await this.columnStore.syncEntity(entity.type, entity.id, entity);
        } else {
          // For batch/scheduled modes, add to queue (simplified here)
          // In production, this would use a proper queuing mechanism
          setTimeout(() => {
            this.columnStore.syncEntity(entity.type, entity.id, entity);
          }, 0);
        }
      }
    }
  }

  async getEntity(type: string, id: string): Promise<Entity | null> {
    await this.initialize();
    return this.entityEngine.getEntity(type, id);
  }

  async deleteEntity(type: string, id: string): Promise<boolean> {
    await this.initialize();

    // Delete from entity store
    const deleted = await this.entityEngine.deleteEntity(type, id);

    // Remove from columnar store if configured
    if (deleted && this.config.enabled && this.config.entityTypes.has(type)) {
      await this.columnStore.removeEntity(type, id);
    }

    return deleted;
  }

  async addEdge(entityType: string, entityId: string, edge: any): Promise<void> {
    await this.initialize();
    return this.entityEngine.addEdge(entityType, entityId, edge);
  }

  async removeEdge(entityType: string, entityId: string, edgeId: string): Promise<boolean> {
    await this.initialize();
    return this.entityEngine.removeEdge(entityType, entityId, edgeId);
  }

  async findPaths(fromId: string, toId: string, maxDepth: number): Promise<any[]> {
    await this.initialize();
    return this.entityEngine.findPaths(fromId, toId, maxDepth);
  }

  async getStats(): Promise<any> {
    await this.initialize();
    const entityStats = await this.entityEngine.getStats();
    
    const columnarStats = {
      enabled: this.config.enabled,
      configuredEntityTypes: Array.from(this.config.entityTypes.keys()),
      totalConfigurations: this.config.entityTypes.size
    };

    return {
      ...entityStats,
      columnar: columnarStats
    };
  }

  async close(): Promise<void> {
    if (this.isInitialized) {
      await this.entityEngine.close();
      this.isInitialized = false;
    }
  }

  // ===== QUERY OPERATIONS (Enhanced with Smart Routing) =====

  async query(params: EnhancedQueryParams): Promise<QueryResult> {
    await this.initialize();

    // Convert enhanced params to legacy format for compatibility
    const legacyParams = this.convertToLegacyParams(params);

    // Use smart router if columnar storage is enabled and auto-routing is on
    if (this.config.enabled && this.config.autoRouting) {
      const result = await this.smartRouter.executeQuery(legacyParams);
      
      // Convert enhanced result back to standard QueryResult
      return {
        entities: result.data,
        metadata: result.metadata ? {
          total: result.data.length,
          executionTime: result.metadata.actualExecutionTime,
          cached: false
        } : undefined
      };
    }

    // Fallback to entity engine only
    return this.entityEngine.query(params);
  }

  // ===== STORAGEEXECUTOR INTERFACE (for SmartQueryRouter) =====

  async executeQuery(params: QueryParams): Promise<QueryResult> {
    // Convert legacy params to enhanced format
    const enhancedParams = this.convertFromLegacyParams(params);
    return this.entityEngine.query(enhancedParams);
  }

  async getAllEntities(entityType: string): Promise<Entity[]> {
    await this.initialize();
    return this.entityEngine.getAllEntities(entityType);
  }

  // ===== ENHANCED QUERY API =====

  /**
   * Execute query with optional enhanced result metadata
   */
  async enhancedQuery(params: QueryParams, includeMetrics: boolean = false): Promise<EnhancedQueryResult> {
    await this.initialize();

    // Enable metrics for this query if requested
    if (includeMetrics) {
      this.smartRouter.setMetricsEnabled(true);
    }

    try {
      const result = await this.smartRouter.executeQuery(params);
      return result;
    } finally {
      // Restore original metrics setting
      this.smartRouter.setMetricsEnabled(false);
    }
  }

  /**
   * Force query to use specific storage strategy
   */
  async queryWithStrategy(
    params: QueryParams, 
    strategy: 'entity' | 'columnar' | 'auto'
  ): Promise<EnhancedQueryResult> {
    await this.initialize();

    if (strategy === 'entity') {
      // Force entity storage only
      const enhancedParams = this.convertFromLegacyParams(params);
      const result = await this.entityEngine.query(enhancedParams);
      return {
        data: result.entities,
        metadata: {
          executionPlan: {
            strategy: 'ENTITY_ONLY',
            reason: 'Forced by user',
            estimatedTime: 0,
            estimatedMemory: 0,
            storageUsed: ['entity'],
            steps: []
          },
          actualExecutionTime: 0,
          storageUsed: ['entity'],
          cacheHits: 0,
          totalRecordsScanned: result.entities.length,
          explanation: 'Query executed on entity store only (forced)'
        }
      };
    } else if (strategy === 'columnar') {
      // Force columnar storage (will fail if not configured)
      if (!this.config.enabled || !this.config.entityTypes.has(params.primary)) {
        throw new Error(`Columnar storage not configured for entity type: ${params.primary}`);
      }
      
      // Force columnar execution through smart router
      this.smartRouter.setMetricsEnabled(true);
      try {
        const result = await this.smartRouter.executeColumnarForced(params);
        return result;
      } finally {
        this.smartRouter.setMetricsEnabled(false);
      }
    } else {
      // Auto strategy (default behavior)
      return this.smartRouter.executeQuery(params);
    }
  }

  // ===== MAINTENANCE AND MONITORING =====

  /**
   * Check consistency between entity and columnar stores
   */
  async checkConsistency(): Promise<ConsistencyReport> {
    await this.initialize();

    const report: ConsistencyReport = {
      entityTypesChecked: [],
      inconsistencies: [],
      repairActions: [],
      status: 'CONSISTENT'
    };

    for (const [entityType, config] of this.config.entityTypes) {
      report.entityTypesChecked.push(entityType);
      
      // Get all entity IDs for this type
      const entities = await this.getAllEntities(entityType);
      const entityIds = entities.map(e => e.id);
      
      // Check consistency for this entity type
      const issues = await this.columnStore.checkConsistency(entityType, entityIds);
      report.inconsistencies.push(...issues);
      
      // Generate repair actions
      const repairActions = await this.columnStore.generateRepairActions(issues);
      report.repairActions.push(...repairActions);
    }

    // Determine overall status
    const highSeverityIssues = report.inconsistencies.filter(issue => issue.severity === 'HIGH');
    const mediumSeverityIssues = report.inconsistencies.filter(issue => issue.severity === 'MEDIUM');
    
    if (highSeverityIssues.length > 0) {
      report.status = 'MAJOR_ISSUES';
    } else if (mediumSeverityIssues.length > 0) {
      report.status = 'MINOR_ISSUES';
    }

    return report;
  }

  /**
   * Get columnar storage metrics
   */
  async getColumnarMetrics(): Promise<ColumnarMetrics> {
    // Simplified metrics implementation
    // In production, this would collect real metrics over time
    return {
      queryMetrics: {
        avgQueryTime: 25,
        queryThroughput: 100,
        cacheHitRate: 0.8
      },
      storageMetrics: {
        columnStoreSize: 1024 * 1024, // 1MB
        compressionRatio: 0.3,
        indexEfficiency: 0.9
      },
      systemMetrics: {
        syncLatency: 5,
        errorRate: 0.01,
        backgroundTasksQueue: 0
      }
    };
  }

  /**
   * Manually sync an entity type to columnar storage
   */
  async syncEntityTypeToColumnar(entityType: string): Promise<void> {
    const config = this.config.entityTypes.get(entityType);
    if (!config) {
      throw new Error(`Columnar storage not configured for entity type: ${entityType}`);
    }

    const entities = await this.getAllEntities(entityType);
    
    for (const entity of entities) {
      await this.columnStore.syncEntity(entityType, entity.id, entity);
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private async backfillColumnarStorage(entityType: string, config: ColumnarEntityConfig): Promise<void> {
    // Get all existing entities of this type
    const entities = await this.getAllEntities(entityType);
    
    // Sync each entity to columnar storage
    for (const entity of entities) {
      await this.columnStore.syncEntity(entityType, entity.id, entity);
    }
  }

  private async backfillColumnarColumns(entityType: string, columns: string[]): Promise<void> {
    // Get all existing entities of this type
    const entities = await this.getAllEntities(entityType);
    
    // Sync each entity to update the new columns
    for (const entity of entities) {
      await this.columnStore.syncEntity(entityType, entity.id, entity);
    }
  }

  private convertToLegacyParams(params: EnhancedQueryParams): QueryParams {
    const legacyParams: QueryParams = {
      primary: Array.isArray(params.from) ? params.from[0] : params.from
    };

    if (params.where) {
      legacyParams.where = params.where.attributes;
    }

    if (params.include) {
      legacyParams.include = params.include;
    }

    if (params.limit) {
      legacyParams.limit = params.limit;
    }

    if (params.offset) {
      legacyParams.offset = params.offset;
    }

    return legacyParams;
  }

  private convertFromLegacyParams(params: QueryParams): EnhancedQueryParams {
    const enhancedParams: EnhancedQueryParams = {
      from: params.primary
    };

    // Handle ID queries
    if (params.id) {
      enhancedParams.where = {
        attributes: {
          id: params.id,
          ...(params.where || {})
        }
      };
    } else if (params.where) {
      enhancedParams.where = {
        attributes: params.where
      };
    }

    if (params.include) {
      enhancedParams.include = params.include;
    }

    if (params.limit) {
      enhancedParams.limit = params.limit;
    }

    if (params.offset) {
      enhancedParams.offset = params.offset;
    }

    if (params.aggregate) {
      enhancedParams.aggregate = params.aggregate;
    }

    if (params.groupBy) {
      enhancedParams.groupBy = params.groupBy;
    }

    if (params.orderBy) {
      enhancedParams.orderBy = params.orderBy;
    }

    return enhancedParams;
  }
}