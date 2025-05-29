/**
 * Smart Query Router
 * 
 * Automatically routes queries to the optimal storage system based on 
 * query characteristics. Provides transparent query routing with zero
 * API changes for existing queries.
 */

import { QueryAnalyzer } from './analyzer';
import { ColumnStore } from '../storage/columnar/column-store';
import {
  QueryAnalysis,
  ExecutionPlan,
  EnhancedQueryResult,
  ColumnarEntityConfig
} from '../../types/enhanced/columnar';
import { QueryParams, QueryResult, Entity } from '../../types';

export interface StorageExecutor {
  executeQuery(params: QueryParams): Promise<QueryResult>;
  getEntity(entityType: string, entityId: string): Promise<Entity | null>;
  getAllEntities(entityType: string): Promise<Entity[]>;
}

export class SmartQueryRouter {
  private queryAnalyzer: QueryAnalyzer;
  private columnStore: ColumnStore;
  private entityExecutor: StorageExecutor;
  private columnarConfigs: Map<string, ColumnarEntityConfig>;
  private metricsEnabled: boolean;

  constructor(
    columnStore: ColumnStore,
    entityExecutor: StorageExecutor,
    columnarConfigs: Map<string, ColumnarEntityConfig>,
    metricsEnabled: boolean = false
  ) {
    this.columnStore = columnStore;
    this.entityExecutor = entityExecutor;
    this.columnarConfigs = columnarConfigs;
    this.queryAnalyzer = new QueryAnalyzer(columnarConfigs);
    this.metricsEnabled = metricsEnabled;
  }

  /**
   * Execute a query using the optimal storage strategy
   */
  async executeQuery(params: QueryParams): Promise<EnhancedQueryResult> {
    const startTime = Date.now();
    
    // Analyze the query
    const analysis = this.queryAnalyzer.analyzeQuery(params);
    const executionPlan = this.queryAnalyzer.createExecutionPlan(params, analysis);
    
    let result: QueryResult;
    let storageUsed: ('entity' | 'columnar')[] = [];
    
    try {
      // Execute based on the plan
      switch (executionPlan.strategy) {
        case 'ENTITY_ONLY':
          result = await this.executeEntityOnly(params);
          storageUsed = ['entity'];
          break;
        case 'COLUMNAR_ONLY':
          result = await this.executeColumnarOnly(params, analysis);
          storageUsed = ['columnar'];
          break;
        case 'HYBRID':
          result = await this.executeHybrid(params, analysis);
          storageUsed = ['columnar', 'entity'];
          break;
        default:
          throw new Error(`Unknown execution strategy: ${executionPlan.strategy}`);
      }
      
      const executionTime = Date.now() - startTime;
      
      // Return enhanced result with metadata if metrics are enabled
      if (this.metricsEnabled) {
        return {
          data: this.extractEntitiesFromResult(result),
          metadata: {
            executionPlan,
            actualExecutionTime: executionTime,
            storageUsed,
            cacheHits: 0, // TODO: Implement cache hit tracking
            totalRecordsScanned: this.estimateRecordsScanned(params, analysis),
            explanation: this.generateExplanation(executionPlan, executionTime)
          }
        };
      }
      
      return {
        data: this.extractEntitiesFromResult(result)
      };
      
    } catch (error) {
      // Fallback to entity store on any columnar error
      console.warn('Columnar query failed, falling back to entity store:', error);
      result = await this.executeEntityOnly(params);
      
      const executionTime = Date.now() - startTime;
      
      return {
        data: this.extractEntitiesFromResult(result),
        metadata: this.metricsEnabled ? {
          executionPlan: { ...executionPlan, strategy: 'ENTITY_ONLY' },
          actualExecutionTime: executionTime,
          storageUsed: ['entity'],
          cacheHits: 0,
          totalRecordsScanned: this.estimateRecordsScanned(params, analysis),
          explanation: 'Fallback to entity store due to columnar error'
        } : undefined
      };
    }
  }

  /**
   * Force execution using columnar store only
   */
  async executeColumnarForced(params: QueryParams): Promise<EnhancedQueryResult> {
    const startTime = Date.now();
    
    // Analyze the query
    const analysis = this.queryAnalyzer.analyzeQuery(params);
    
    let result: QueryResult;
    let storageUsed: ('entity' | 'columnar')[] = ['columnar'];
    
    try {
      // Force columnar execution regardless of analysis
      result = await this.executeColumnarOnly(params, analysis);
      
      const executionTime = Date.now() - startTime;
      
      // Return enhanced result with metadata
      return {
        data: this.extractEntitiesFromResult(result),
        metadata: {
          executionPlan: {
            strategy: 'COLUMNAR_ONLY',
            reason: 'Forced by user',
            estimatedTime: executionTime,
            estimatedMemory: 0,
            storageUsed,
            steps: []
          },
          actualExecutionTime: executionTime,
          storageUsed,
          cacheHits: 0,
          totalRecordsScanned: this.estimateRecordsScanned(params, analysis),
          explanation: 'Query executed on columnar store only (forced)'
        }
      };
      
    } catch (error) {
      throw new Error(`Forced columnar execution failed: ${error.message}`);
    }
  }

  /**
   * Execute query using entity store only
   */
  private async executeEntityOnly(params: QueryParams): Promise<QueryResult> {
    return this.entityExecutor.executeQuery(params);
  }

  /**
   * Execute query using columnar store only
   */
  private async executeColumnarOnly(params: QueryParams, analysis: QueryAnalysis): Promise<QueryResult> {
    const entityType = params.primary;
    
    if (!entityType) {
      throw new Error('Entity type is required for columnar queries');
    }

    // Handle aggregation queries
    if (params.aggregate) {
      return this.executeColumnarAggregation(entityType, params);
    }

    // Handle group by queries
    if (params.groupBy) {
      return this.executeColumnarGroupBy(entityType, params);
    }

    // Handle filtering queries
    if (params.where) {
      return this.executeColumnarFilter(entityType, params);
    }

    // Default: return empty result for unsupported columnar operations
    return [];
  }

  /**
   * Execute query using hybrid approach (columnar filtering + entity fetching)
   */
  private async executeHybrid(params: QueryParams, analysis: QueryAnalysis): Promise<QueryResult> {
    const entityType = params.primary;
    
    if (!entityType) {
      throw new Error('Entity type is required for hybrid queries');
    }

    // Step 1: Use columnar store for fast filtering
    const candidateIds = await this.getFilteredEntityIds(entityType, params);
    
    // Step 2: Fetch complete entities from entity store
    const entities = await this.fetchEntitiesByIds(entityType, candidateIds);
    
    // Step 3: Apply any remaining operations on full entities
    return this.applyPostProcessing(entities, params);
  }

  /**
   * Execute aggregation using columnar store
   */
  private async executeColumnarAggregation(entityType: string, params: QueryParams): Promise<QueryResult> {
    if (!params.aggregate || typeof params.aggregate !== 'object') {
      throw new Error('Invalid aggregation parameters');
    }

    const results: Record<string, number> = {};
    
    for (const [column, operation] of Object.entries(params.aggregate)) {
      let filterIds: string[] | undefined;
      
      // Apply filters if present
      if (params.where) {
        filterIds = await this.getFilteredEntityIds(entityType, params);
      }
      
      const value = await this.columnStore.aggregateColumn(
        entityType, 
        column, 
        operation.toUpperCase() as any, 
        filterIds
      );
      
      results[`${operation}_${column}`] = value;
    }
    
    return results;
  }

  /**
   * Execute group by using columnar store
   */
  private async executeColumnarGroupBy(entityType: string, params: QueryParams): Promise<QueryResult> {
    if (!params.groupBy) {
      throw new Error('Group by column is required');
    }

    const groupByColumn = Array.isArray(params.groupBy) ? params.groupBy[0] : params.groupBy;
    
    if (params.aggregate && typeof params.aggregate === 'object') {
      // Group by with aggregation
      const results: Record<string, any> = {};
      
      for (const [column, operation] of Object.entries(params.aggregate)) {
        const groupedResults = await this.columnStore.groupByAggregate(
          entityType,
          groupByColumn,
          column,
          operation.toUpperCase() as any
        );
        
        // Convert Map to object
        for (const [groupKey, value] of groupedResults) {
          if (!results[groupKey]) {
            results[groupKey] = {};
          }
          results[groupKey][`${operation}_${column}`] = value;
        }
      }
      
      return results;
    } else {
      // Simple group by (count)
      const groupedResults = await this.columnStore.groupByAggregate(
        entityType,
        groupByColumn,
        groupByColumn, // Use same column for counting
        'COUNT'
      );
      
      const results: Record<string, number> = {};
      for (const [groupKey, count] of groupedResults) {
        results[groupKey] = count;
      }
      
      return results;
    }
  }

  /**
   * Execute filtering using columnar store
   */
  private async executeColumnarFilter(entityType: string, params: QueryParams): Promise<QueryResult> {
    const entityIds = await this.getFilteredEntityIds(entityType, params);
    
    // If we only need entity IDs, return them
    if (params.include && params.include.length === 1 && params.include[0] === 'id') {
      return entityIds.map(id => ({ id }));
    }
    
    // Otherwise, fetch full entities
    return this.fetchEntitiesByIds(entityType, entityIds);
  }

  /**
   * Get filtered entity IDs using columnar indexes
   */
  private async getFilteredEntityIds(entityType: string, params: QueryParams): Promise<string[]> {
    if (!params.where) {
      return [];
    }

    const allEntityIds = new Set<string>();
    let isFirstFilter = true;

    // Apply each filter operation
    for (const [column, condition] of Object.entries(params.where)) {
      let columnEntityIds: string[] = [];

      if (typeof condition === 'object' && condition !== null) {
        // Handle complex conditions like { gt: 100, lt: 200 }
        for (const [operator, value] of Object.entries(condition)) {
          const filteredIds = await this.columnStore.filterByColumn(
            entityType,
            column,
            operator as any,
            value
          );
          
          if (columnEntityIds.length === 0) {
            columnEntityIds = filteredIds;
          } else {
            // Intersection of results for multiple conditions on same column
            columnEntityIds = columnEntityIds.filter(id => filteredIds.includes(id));
          }
        }
      } else {
        // Simple equality condition
        columnEntityIds = await this.columnStore.filterByColumn(
          entityType,
          column,
          'eq',
          condition
        );
      }

      if (isFirstFilter) {
        // First filter - initialize the set
        columnEntityIds.forEach(id => allEntityIds.add(id));
        isFirstFilter = false;
      } else {
        // Subsequent filters - intersection (AND operation)
        const intersection = new Set<string>();
        for (const id of allEntityIds) {
          if (columnEntityIds.includes(id)) {
            intersection.add(id);
          }
        }
        allEntityIds.clear();
        intersection.forEach(id => allEntityIds.add(id));
      }
    }

    return Array.from(allEntityIds);
  }

  /**
   * Fetch entities by IDs from entity store
   */
  private async fetchEntitiesByIds(entityType: string, entityIds: string[]): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    for (const entityId of entityIds) {
      const entity = await this.entityExecutor.getEntity(entityType, entityId);
      if (entity) {
        entities.push(entity);
      }
    }
    
    return entities;
  }

  /**
   * Apply post-processing operations on entities
   */
  private applyPostProcessing(entities: Entity[], params: QueryParams): Entity[] {
    let result = entities;

    // Apply ordering
    if (params.orderBy) {
      result = this.applyOrdering(result, params.orderBy);
    }

    // Apply limit and offset
    if (params.limit || params.offset) {
      const offset = params.offset || 0;
      const limit = params.limit;
      
      result = result.slice(offset, limit ? offset + limit : undefined);
    }

    return result;
  }

  /**
   * Apply ordering to entities
   */
  private applyOrdering(entities: Entity[], orderBy: any): Entity[] {
    if (typeof orderBy === 'string') {
      // Simple column ordering
      return entities.sort((a, b) => {
        const aVal = a.attributes?.[orderBy];
        const bVal = b.attributes?.[orderBy];
        
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
        return 0;
      });
    }
    
    if (Array.isArray(orderBy)) {
      // Multiple column ordering
      return entities.sort((a, b) => {
        for (const order of orderBy) {
          let column: string;
          let direction: 'ASC' | 'DESC' = 'ASC';
          
          if (typeof order === 'string') {
            column = order;
          } else if (typeof order === 'object' && order.column) {
            column = order.column;
            direction = order.direction || 'ASC';
          } else {
            continue;
          }
          
          const aVal = a.attributes?.[column];
          const bVal = b.attributes?.[column];
          
          let comparison = 0;
          if (aVal < bVal) comparison = -1;
          else if (aVal > bVal) comparison = 1;
          
          if (comparison !== 0) {
            return direction === 'DESC' ? -comparison : comparison;
          }
        }
        return 0;
      });
    }
    
    return entities;
  }

  /**
   * Generate explanation for query execution
   */
  private generateExplanation(plan: ExecutionPlan, actualTime: number): string {
    const timeDiff = actualTime - plan.estimatedTime;
    const timeInfo = timeDiff > 0 ? 
      ` (${timeDiff}ms slower than estimated)` : 
      ` (${Math.abs(timeDiff)}ms faster than estimated)`;
    
    switch (plan.strategy) {
      case 'ENTITY_ONLY':
        return `Used entity store for ${plan.reason.toLowerCase()}${timeInfo}`;
      case 'COLUMNAR_ONLY':
        return `Used columnar store for optimal analytical performance${timeInfo}`;
      case 'HYBRID':
        return `Used columnar store for filtering, then entity store for complete records${timeInfo}`;
      default:
        return `Executed with ${plan.strategy} strategy${timeInfo}`;
    }
  }

  /**
   * Estimate records scanned for metrics
   */
  private estimateRecordsScanned(params: QueryParams, analysis: QueryAnalysis): number {
    // Simple estimation - would be improved with actual statistics
    if (params.id) return 1;
    
    // Use selectivity to estimate scanned records
    const estimatedTotalRecords = 1000; // Default estimate
    return Math.ceil(estimatedTotalRecords * analysis.estimatedSelectivity);
  }

  /**
   * Update columnar configurations
   */
  updateColumnarConfigs(configs: Map<string, ColumnarEntityConfig>): void {
    this.columnarConfigs = configs;
    this.queryAnalyzer = new QueryAnalyzer(configs);
  }

  /**
   * Enable or disable metrics collection
   */
  setMetricsEnabled(enabled: boolean): void {
    this.metricsEnabled = enabled;
  }

  /**
   * Extract entities from query result, handling both arrays and QueryResult objects
   */
  private extractEntitiesFromResult(result: any): any[] {
    if (Array.isArray(result)) {
      return result;
    }
    
    if (result && typeof result === 'object' && result.entities) {
      return result.entities;
    }
    
    return [result];
  }
}