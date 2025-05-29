/**
 * Query Analyzer
 * 
 * Analyzes query characteristics to determine the optimal execution strategy
 * for the dual-storage system. Routes queries to entity store, columnar store,
 * or hybrid approach based on query patterns.
 */

import {
  QueryAnalysis,
  QueryType,
  ExecutionPlan,
  ExecutionStep,
  CostAnalysis,
  StorageCost,
  ColumnarEntityConfig
} from '../../types/enhanced/columnar';
import { QueryParams } from '../../types';

export class QueryAnalyzer {
  private columnarConfigs: Map<string, ColumnarEntityConfig>;

  constructor(columnarConfigs: Map<string, ColumnarEntityConfig>) {
    this.columnarConfigs = columnarConfigs;
  }

  /**
   * Analyze a query to determine its characteristics
   */
  analyzeQuery(params: QueryParams): QueryAnalysis {
    const type = this.determineQueryType(params);
    const complexity = this.calculateComplexity(params);
    const dataRequirements = this.analyzeDataNeeds(params);
    const estimatedSelectivity = this.estimateSelectivity(params);
    const requiredColumns = this.extractRequiredColumns(params);
    const hasAggregation = this.hasAggregationOperations(params);
    const hasGroupBy = this.hasGroupByOperations(params);
    const needsFullRecords = this.needsCompleteRecords(params);

    return {
      type,
      complexity,
      dataRequirements,
      estimatedSelectivity,
      requiredColumns,
      hasAggregation,
      hasGroupBy,
      needsFullRecords
    };
  }

  /**
   * Create an execution plan based on query analysis
   */
  createExecutionPlan(params: QueryParams, analysis: QueryAnalysis): ExecutionPlan {
    const entityType = params.primary;
    const hasColumnarConfig = this.columnarConfigs.has(entityType);

    if (!hasColumnarConfig) {
      // No columnar configuration - use entity store only
      return {
        strategy: 'ENTITY_ONLY',
        reason: 'No columnar configuration for entity type',
        estimatedTime: this.estimateEntityOnlyTime(params),
        estimatedMemory: this.estimateEntityOnlyMemory(params),
        storageUsed: ['entity'],
        steps: this.createEntityOnlySteps(params)
      };
    }

    const config = this.columnarConfigs.get(entityType)!;
    const costAnalysis = this.analyzeCost(params, analysis, config);

    return costAnalysis.recommendation;
  }

  /**
   * Perform cost analysis to select optimal strategy
   */
  private analyzeCost(params: QueryParams, analysis: QueryAnalysis, config: ColumnarEntityConfig): CostAnalysis {
    const entityStoreCost = this.calculateEntityStoreCost(params, analysis);
    const columnStoreCost = this.calculateColumnStoreCost(params, analysis, config);
    const hybridCost = this.calculateHybridCost(params, analysis, config);

    // Select the lowest cost strategy
    let recommendation: ExecutionPlan;
    
    if (analysis.type === 'ANALYTICAL' && this.canUseColumnarOnly(params, config)) {
      recommendation = {
        strategy: 'COLUMNAR_ONLY',
        reason: 'Analytical query with all required columns available in columnar store',
        estimatedTime: columnStoreCost.executionTime,
        estimatedMemory: columnStoreCost.memoryUsage,
        storageUsed: ['columnar'],
        steps: this.createColumnarOnlySteps(params, config)
      };
    } else if (analysis.type === 'TRANSACTIONAL' || !this.hasRelevantColumns(params, config)) {
      recommendation = {
        strategy: 'ENTITY_ONLY',
        reason: 'Transactional query or required columns not in columnar store',
        estimatedTime: entityStoreCost.executionTime,
        estimatedMemory: entityStoreCost.memoryUsage,
        storageUsed: ['entity'],
        steps: this.createEntityOnlySteps(params)
      };
    } else {
      // Hybrid approach
      recommendation = {
        strategy: 'HYBRID',
        reason: 'Complex query benefits from hybrid approach',
        estimatedTime: hybridCost.executionTime,
        estimatedMemory: hybridCost.memoryUsage,
        storageUsed: ['columnar', 'entity'],
        steps: this.createHybridSteps(params, config)
      };
    }

    return {
      entityStoreCost,
      columnStoreCost,
      hybridCost,
      recommendation
    };
  }

  // Query type determination

  private determineQueryType(params: QueryParams): QueryType {
    // Check for aggregation operations
    if (params.aggregate || this.hasAggregationOperations(params)) {
      return 'ANALYTICAL';
    }

    // Check for group by operations
    if (params.groupBy || this.hasGroupByOperations(params)) {
      return 'ANALYTICAL';
    }

    // Single entity lookup with relationships
    if (params.id && this.needsCompleteRecords(params)) {
      return 'TRANSACTIONAL';
    }

    // Graph traversal operations
    if (params.traverse || this.hasGraphOperations(params)) {
      return 'TRANSACTIONAL';
    }

    // Complex filters with full record requirements
    if (this.hasComplexFilters(params) && this.needsCompleteRecords(params)) {
      return 'HYBRID';
    }

    // Default to transactional for safety
    return 'TRANSACTIONAL';
  }

  private calculateComplexity(params: QueryParams): 'LOW' | 'MEDIUM' | 'HIGH' {
    let complexityScore = 0;

    // Add complexity for each operation
    if (params.where) complexityScore += this.countFilterOperations(params.where);
    if (params.aggregate) complexityScore += 2;
    if (params.groupBy) complexityScore += 2;
    if (params.orderBy) complexityScore += 1;
    if (params.include && params.include.length > 5) complexityScore += 2;
    if (params.traverse) complexityScore += 3;

    if (complexityScore <= 3) return 'LOW';
    if (complexityScore <= 8) return 'MEDIUM';
    return 'HIGH';
  }

  private analyzeDataNeeds(params: QueryParams): 'FULL_RECORDS' | 'COLUMNS_ONLY' | 'MIXED' {
    const needsFullRecords = this.needsCompleteRecords(params);
    const hasSelectiveColumns = this.hasSelectiveColumnAccess(params);

    if (needsFullRecords && hasSelectiveColumns) return 'MIXED';
    if (needsFullRecords) return 'FULL_RECORDS';
    return 'COLUMNS_ONLY';
  }

  private estimateSelectivity(params: QueryParams): number {
    if (!params.where) return 1.0; // No filters = full scan

    // Simple heuristic - would be improved with actual statistics
    const filterCount = this.countFilterOperations(params.where);
    
    // Each filter operation reduces selectivity
    return Math.max(0.01, 1.0 / Math.pow(2, filterCount));
  }

  private extractRequiredColumns(params: QueryParams): string[] {
    const columns = new Set<string>();

    // Add columns from filters
    if (params.where) {
      this.extractColumnsFromFilter(params.where, columns);
    }

    // Add columns from aggregation
    if (params.aggregate) {
      if (typeof params.aggregate === 'object') {
        Object.keys(params.aggregate).forEach(col => columns.add(col));
      }
    }

    // Add columns from groupBy
    if (params.groupBy) {
      if (Array.isArray(params.groupBy)) {
        params.groupBy.forEach(col => columns.add(col));
      } else {
        columns.add(params.groupBy);
      }
    }

    // Add columns from orderBy
    if (params.orderBy) {
      if (Array.isArray(params.orderBy)) {
        params.orderBy.forEach(order => {
          if (typeof order === 'object' && order.column) {
            columns.add(order.column);
          } else if (typeof order === 'string') {
            columns.add(order);
          }
        });
      }
    }

    return Array.from(columns);
  }

  // Helper methods for query analysis

  private hasAggregationOperations(params: QueryParams): boolean {
    return !!(params.aggregate || 
             (params as any).sum || 
             (params as any).avg || 
             (params as any).count ||
             (params as any).min ||
             (params as any).max);
  }

  private hasGroupByOperations(params: QueryParams): boolean {
    return !!(params.groupBy);
  }

  private needsCompleteRecords(params: QueryParams): boolean {
    // Check if query needs full entity records
    if (params.include) {
      if (params.include.includes('*')) return true;
      if (params.include.length > 10) return true; // Arbitrary threshold
    }
    
    if (params.traverse) return true;
    if (params.id && !params.aggregate) return true; // Single entity lookup
    
    return false;
  }

  private hasComplexFilters(params: QueryParams): boolean {
    if (!params.where) return false;
    
    return this.countFilterOperations(params.where) >= 2;
  }

  private hasGraphOperations(params: QueryParams): boolean {
    return !!(params.traverse || 
             (params.include && params.include.some(inc => inc.includes('.'))));
  }

  private hasSelectiveColumnAccess(params: QueryParams): boolean {
    return !!(params.aggregate || params.groupBy || 
             (params.include && !params.include.includes('*')));
  }

  private countFilterOperations(where: any): number {
    if (!where || typeof where !== 'object') return 0;
    
    let count = 0;
    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        count += Object.keys(value).length;
      } else {
        count += 1;
      }
    }
    
    return count;
  }

  private extractColumnsFromFilter(where: any, columns: Set<string>): void {
    if (!where || typeof where !== 'object') return;
    
    for (const [key, value] of Object.entries(where)) {
      columns.add(key);
      
      if (typeof value === 'object' && value !== null) {
        this.extractColumnsFromFilter(value, columns);
      }
    }
  }

  // Cost calculation methods

  private calculateEntityStoreCost(params: QueryParams, analysis: QueryAnalysis): StorageCost {
    const baseTime = params.id ? 5 : 100; // Single entity vs scan
    const memoryBase = params.id ? 1024 : 1024 * 1024; // 1KB vs 1MB
    
    const complexityMultiplier = analysis.complexity === 'HIGH' ? 3 : 
                               analysis.complexity === 'MEDIUM' ? 2 : 1;
    
    return {
      executionTime: baseTime * complexityMultiplier,
      memoryUsage: memoryBase * complexityMultiplier,
      ioOperations: params.id ? 1 : 100,
      score: baseTime * complexityMultiplier
    };
  }

  private calculateColumnStoreCost(params: QueryParams, analysis: QueryAnalysis, config: ColumnarEntityConfig): StorageCost {
    const baseTime = 10; // Fast columnar operations
    const memoryBase = 1024 * 100; // 100KB for column data
    
    const relevantColumns = analysis.requiredColumns.filter(col => config.columns.includes(col));
    const columnMultiplier = relevantColumns.length;
    
    return {
      executionTime: baseTime * columnMultiplier,
      memoryUsage: memoryBase * columnMultiplier,
      ioOperations: columnMultiplier,
      score: baseTime * columnMultiplier
    };
  }

  private calculateHybridCost(params: QueryParams, analysis: QueryAnalysis, config: ColumnarEntityConfig): StorageCost {
    const columnCost = this.calculateColumnStoreCost(params, analysis, config);
    const entityCost = this.calculateEntityStoreCost(params, analysis);
    
    // Hybrid uses both but with reduced entity operations due to filtering
    const selectivityReduction = analysis.estimatedSelectivity;
    
    return {
      executionTime: columnCost.executionTime + (entityCost.executionTime * selectivityReduction),
      memoryUsage: columnCost.memoryUsage + (entityCost.memoryUsage * selectivityReduction),
      ioOperations: columnCost.ioOperations + (entityCost.ioOperations * selectivityReduction),
      score: columnCost.score + (entityCost.score * selectivityReduction)
    };
  }

  // Strategy validation methods

  private canUseColumnarOnly(params: QueryParams, config: ColumnarEntityConfig): boolean {
    const requiredColumns = this.extractRequiredColumns(params);
    return requiredColumns.every(col => config.columns.includes(col)) && 
           !this.needsCompleteRecords(params);
  }

  private hasRelevantColumns(params: QueryParams, config: ColumnarEntityConfig): boolean {
    const requiredColumns = this.extractRequiredColumns(params);
    return requiredColumns.some(col => config.columns.includes(col));
  }

  // Execution step generation

  private createEntityOnlySteps(params: QueryParams): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    
    if (params.id) {
      steps.push({
        order: 1,
        description: 'Load single entity from entity store',
        storage: 'entity',
        estimatedTime: 5
      });
    } else {
      steps.push({
        order: 1,
        description: 'Scan entity store with filters',
        storage: 'entity',
        estimatedTime: 100
      });
    }
    
    if (params.aggregate) {
      steps.push({
        order: 2,
        description: 'Apply aggregation operations',
        storage: 'entity',
        estimatedTime: 50
      });
    }
    
    return steps;
  }

  private createColumnarOnlySteps(params: QueryParams, config: ColumnarEntityConfig): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    
    if (params.where) {
      steps.push({
        order: 1,
        description: 'Filter using columnar indexes',
        storage: 'columnar',
        estimatedTime: 5
      });
    }
    
    if (params.aggregate) {
      steps.push({
        order: 2,
        description: 'Perform columnar aggregation',
        storage: 'columnar',
        estimatedTime: 10
      });
    }
    
    if (params.groupBy) {
      steps.push({
        order: 3,
        description: 'Group by columnar data',
        storage: 'columnar',
        estimatedTime: 15
      });
    }
    
    return steps;
  }

  private createHybridSteps(params: QueryParams, config: ColumnarEntityConfig): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    
    steps.push({
      order: 1,
      description: 'Filter candidates using columnar store',
      storage: 'columnar',
      estimatedTime: 10
    });
    
    steps.push({
      order: 2,
      description: 'Fetch full records from entity store',
      storage: 'entity',
      estimatedTime: 25
    });
    
    if (params.aggregate) {
      steps.push({
        order: 3,
        description: 'Apply final aggregations',
        storage: 'entity',
        estimatedTime: 15
      });
    }
    
    return steps;
  }

  // Estimation helper methods

  private estimateEntityOnlyTime(params: QueryParams): number {
    return params.id ? 5 : 100;
  }

  private estimateEntityOnlyMemory(params: QueryParams): number {
    return params.id ? 1024 : 1024 * 1024;
  }
}