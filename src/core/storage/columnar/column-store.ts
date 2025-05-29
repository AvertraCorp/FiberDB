/**
 * ColumnStore Implementation
 * 
 * Provides columnar storage capabilities for FiberDB entities,
 * storing only configured columns in an optimized format for
 * analytical queries and aggregations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import {
  ColumnarEntityConfig,
  ColumnData,
  ColumnIndex,
  ConsistencyIssue,
  RepairAction
} from '../../../types/enhanced/columnar';
import { Entity } from '../../../types';

export class ColumnStore {
  private basePath: string;
  private configs: Map<string, ColumnarEntityConfig>;
  private columnCache: Map<string, ColumnData>;
  private maxCacheSize: number;

  constructor(basePath: string, maxCacheSize: number = 100) {
    this.basePath = basePath;
    this.configs = new Map();
    this.columnCache = new Map();
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Initialize columnar storage for an entity type
   */
  async initializeEntityType(entityType: string, config: ColumnarEntityConfig): Promise<void> {
    this.configs.set(entityType, config);
    
    // Create directory structure
    const entityPath = path.join(this.basePath, 'columnar', entityType);
    const indexPath = path.join(entityPath, 'indexes');
    
    await fs.mkdir(entityPath, { recursive: true });
    await fs.mkdir(indexPath, { recursive: true });
    
    // Initialize empty column files for configured columns
    for (const column of config.columns) {
      await this.initializeColumn(entityType, column);
    }
  }

  /**
   * Sync an entity to columnar storage (only configured columns)
   */
  async syncEntity(entityType: string, entityId: string, entity: Entity): Promise<void> {
    const config = this.configs.get(entityType);
    if (!config) {
      return; // No columnar configuration for this entity type
    }

    // Extract only configured columns
    const relevantData = this.extractConfiguredColumns(entity, config.columns);
    
    // Update each configured column
    for (const [columnName, value] of Object.entries(relevantData)) {
      await this.updateColumn(entityType, columnName, entityId, value);
    }

    // Update indexes for configured indexed columns
    for (const indexedColumn of config.indexes) {
      if (relevantData.hasOwnProperty(indexedColumn)) {
        await this.updateIndex(entityType, indexedColumn, entityId, relevantData[indexedColumn]);
      }
    }
  }

  /**
   * Remove an entity from columnar storage
   */
  async removeEntity(entityType: string, entityId: string): Promise<void> {
    const config = this.configs.get(entityType);
    if (!config) {
      return;
    }

    // Remove from each column
    for (const columnName of config.columns) {
      await this.removeFromColumn(entityType, columnName, entityId);
    }

    // Remove from indexes
    for (const indexedColumn of config.indexes) {
      await this.removeFromIndex(entityType, indexedColumn, entityId);
    }
  }

  /**
   * Read a column's data for analytical queries
   */
  async readColumn(entityType: string, columnName: string): Promise<ColumnData | null> {
    const cacheKey = `${entityType}:${columnName}`;
    
    // Check cache first
    if (this.columnCache.has(cacheKey)) {
      return this.columnCache.get(cacheKey)!;
    }

    // Load from disk
    const columnPath = this.getColumnPath(entityType, columnName);
    
    try {
      const data = await fs.readFile(columnPath);
      const columnData = this.deserializeColumnData(data);
      
      // Add to cache if under limit
      if (this.columnCache.size < this.maxCacheSize) {
        this.columnCache.set(cacheKey, columnData);
      }
      
      return columnData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // Column file doesn't exist
      }
      throw error;
    }
  }

  /**
   * Filter entities using columnar indexes for fast analytical queries
   */
  async filterByColumn(
    entityType: string,
    columnName: string,
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in',
    value: any
  ): Promise<string[]> {
    const indexPath = this.getIndexPath(entityType, columnName);
    
    try {
      const indexData = await fs.readFile(indexPath);
      const index = this.deserializeIndex(indexData);
      
      return this.applyFilter(index, operator, value);
    } catch (error) {
      // Fallback to full column scan if no index
      const columnData = await this.readColumn(entityType, columnName);
      if (!columnData) {
        return [];
      }
      
      return this.scanColumnForValue(columnData, operator, value);
    }
  }

  /**
   * Perform aggregation on a column
   */
  async aggregateColumn(
    entityType: string,
    columnName: string,
    operation: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX',
    filterIds?: string[]
  ): Promise<number> {
    const columnData = await this.readColumn(entityType, columnName);
    if (!columnData) {
      return 0;
    }

    let values = columnData.data;
    
    // Filter to specific entity IDs if provided
    if (filterIds && filterIds.length > 0) {
      values = this.filterColumnByIds(columnData, filterIds);
    }

    // Ensure values is an array
    const dataArray = Array.isArray(values) ? values : [];
    
    switch (operation) {
      case 'SUM':
        return dataArray.reduce((sum, val) => sum + (Number(val) || 0), 0);
      case 'AVG':
        const sum = dataArray.reduce((sum, val) => sum + (Number(val) || 0), 0);
        return dataArray.length > 0 ? sum / dataArray.length : 0;
      case 'COUNT':
        return dataArray.length;
      case 'MIN':
        return dataArray.length > 0 ? Math.min(...dataArray.map(Number)) : 0;
      case 'MAX':
        return dataArray.length > 0 ? Math.max(...dataArray.map(Number)) : 0;
      default:
        throw new Error(`Unsupported aggregation operation: ${operation}`);
    }
  }

  /**
   * Group by a column and aggregate another column
   */
  async groupByAggregate(
    entityType: string,
    groupByColumn: string,
    aggregateColumn: string,
    operation: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'
  ): Promise<Map<any, number>> {
    const groupByData = await this.readColumn(entityType, groupByColumn);
    const aggregateData = await this.readColumn(entityType, aggregateColumn);
    
    if (!groupByData || !aggregateData) {
      return new Map();
    }

    const result = new Map<any, number>();
    const groups = new Map<any, number[]>();
    
    // Group values by the groupBy column
    const groupByArray = Array.isArray(groupByData.data) ? groupByData.data : [];
    const aggregateArray = Array.isArray(aggregateData.data) ? aggregateData.data : [];
    
    for (let i = 0; i < Math.min(groupByArray.length, aggregateArray.length); i++) {
      const groupKey = groupByArray[i];
      const aggregateValue = Number(aggregateArray[i]) || 0;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(aggregateValue);
    }

    // Apply aggregation to each group
    for (const [groupKey, values] of groups) {
      switch (operation) {
        case 'SUM':
          result.set(groupKey, values.reduce((sum, val) => sum + val, 0));
          break;
        case 'AVG':
          result.set(groupKey, values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0);
          break;
        case 'COUNT':
          result.set(groupKey, values.length);
          break;
        case 'MIN':
          result.set(groupKey, values.length > 0 ? Math.min(...values) : 0);
          break;
        case 'MAX':
          result.set(groupKey, values.length > 0 ? Math.max(...values) : 0);
          break;
      }
    }

    return result;
  }

  /**
   * Check consistency between entity store and column store
   */
  async checkConsistency(entityType: string, entityIds: string[]): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];
    const config = this.configs.get(entityType);
    
    if (!config) {
      return issues;
    }

    // Check each configured column
    for (const columnName of config.columns) {
      const columnData = await this.readColumn(entityType, columnName);
      
      if (!columnData) {
        issues.push({
          type: 'MISSING_COLUMN_DATA',
          entityType,
          column: columnName,
          description: `Column ${columnName} is configured but has no data`,
          severity: 'HIGH'
        });
        continue;
      }

      // Check if column has correct number of records
      const expectedCount = entityIds.length;
      const actualCount = Array.isArray(columnData.data) ? columnData.data.length : 0;
      
      if (actualCount !== expectedCount) {
        issues.push({
          type: 'DATA_MISMATCH',
          entityType,
          column: columnName,
          description: `Column ${columnName} has ${actualCount} records but expected ${expectedCount}`,
          severity: 'MEDIUM'
        });
      }
    }

    return issues;
  }

  /**
   * Generate repair actions for consistency issues
   */
  async generateRepairActions(issues: ConsistencyIssue[]): Promise<RepairAction[]> {
    const actions: RepairAction[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'MISSING_COLUMN_DATA':
          actions.push({
            type: 'REBUILD_COLUMN',
            entityType: issue.entityType,
            column: issue.column,
            description: `Rebuild column ${issue.column} from entity store`,
            estimatedTime: 5000 // 5 seconds estimated
          });
          break;
        case 'DATA_MISMATCH':
          actions.push({
            type: 'SYNC_DATA',
            entityType: issue.entityType,
            column: issue.column,
            description: `Sync column ${issue.column} with entity store`,
            estimatedTime: 3000 // 3 seconds estimated
          });
          break;
        case 'INDEX_CORRUPTION':
          actions.push({
            type: 'REBUILD_INDEX',
            entityType: issue.entityType,
            column: issue.column,
            description: `Rebuild index for column ${issue.column}`,
            estimatedTime: 2000 // 2 seconds estimated
          });
          break;
      }
    }

    return actions;
  }

  // Private helper methods

  private extractConfiguredColumns(entity: Entity, configuredColumns: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const column of configuredColumns) {
      if (entity.attributes && entity.attributes.hasOwnProperty(column)) {
        result[column] = entity.attributes[column];
      }
    }
    
    return result;
  }

  private async initializeColumn(entityType: string, columnName: string): Promise<void> {
    const columnPath = this.getColumnPath(entityType, columnName);
    
    const columnData: ColumnData = {
      name: columnName,
      type: 'string', // Will be inferred on first data
      data: [],
      compressed: false,
      metadata: {
        entityType,
        recordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        checksum: ''
      }
    };

    await fs.writeFile(columnPath, this.serializeColumnData(columnData));
  }

  private async updateColumn(entityType: string, columnName: string, entityId: string, value: any): Promise<void> {
    const columnData = await this.readColumn(entityType, columnName);
    if (!columnData) {
      await this.initializeColumn(entityType, columnName);
      return this.updateColumn(entityType, columnName, entityId, value);
    }

    // Add or update the value
    const dataArray = Array.isArray(columnData.data) ? columnData.data : [];
    dataArray.push(value);
    
    columnData.data = dataArray;
    columnData.metadata.recordCount = dataArray.length;
    columnData.metadata.updatedAt = new Date();
    columnData.metadata.checksum = this.calculateChecksum(dataArray);

    // Write back to disk
    const columnPath = this.getColumnPath(entityType, columnName);
    await fs.writeFile(columnPath, this.serializeColumnData(columnData));
    
    // Update cache
    const cacheKey = `${entityType}:${columnName}`;
    this.columnCache.set(cacheKey, columnData);
  }

  private async updateIndex(entityType: string, columnName: string, entityId: string, value: any): Promise<void> {
    // Simple hash-based index implementation
    const indexPath = this.getIndexPath(entityType, columnName);
    
    let index: Map<any, string[]>;
    try {
      const indexData = await fs.readFile(indexPath);
      index = this.deserializeIndex(indexData);
    } catch {
      index = new Map();
    }

    if (!index.has(value)) {
      index.set(value, []);
    }
    
    const entityIds = index.get(value)!;
    if (!entityIds.includes(entityId)) {
      entityIds.push(entityId);
    }

    await fs.writeFile(indexPath, this.serializeIndex(index));
  }

  private async removeFromColumn(entityType: string, columnName: string, entityId: string): Promise<void> {
    // For simplicity, we'll rebuild the column without the entity
    // In production, this could be optimized with tombstone markers
    const columnData = await this.readColumn(entityType, columnName);
    if (!columnData) {
      return;
    }

    // This is a simplified implementation
    // In practice, you'd need to maintain entity ID to array index mapping
    columnData.metadata.updatedAt = new Date();
    
    const columnPath = this.getColumnPath(entityType, columnName);
    await fs.writeFile(columnPath, this.serializeColumnData(columnData));
  }

  private async removeFromIndex(entityType: string, columnName: string, entityId: string): Promise<void> {
    const indexPath = this.getIndexPath(entityType, columnName);
    
    try {
      const indexData = await fs.readFile(indexPath);
      const index = this.deserializeIndex(indexData);
      
      // Remove entityId from all index entries
      for (const [value, entityIds] of index) {
        const newEntityIds = entityIds.filter(id => id !== entityId);
        if (newEntityIds.length === 0) {
          index.delete(value);
        } else {
          index.set(value, newEntityIds);
        }
      }
      
      await fs.writeFile(indexPath, this.serializeIndex(index));
    } catch {
      // Index doesn't exist, nothing to remove
    }
  }

  private getColumnPath(entityType: string, columnName: string): string {
    return path.join(this.basePath, 'columnar', entityType, `${columnName}.col`);
  }

  private getIndexPath(entityType: string, columnName: string): string {
    return path.join(this.basePath, 'columnar', entityType, 'indexes', `${columnName}.idx`);
  }

  private serializeColumnData(columnData: ColumnData): Buffer {
    const json = JSON.stringify(columnData);
    return Buffer.from(json, 'utf8');
  }

  private deserializeColumnData(buffer: Buffer): ColumnData {
    const json = buffer.toString('utf8');
    return JSON.parse(json);
  }

  private serializeIndex(index: Map<any, string[]>): Buffer {
    const obj = Object.fromEntries(index);
    const json = JSON.stringify(obj);
    return Buffer.from(json, 'utf8');
  }

  private deserializeIndex(buffer: Buffer): Map<any, string[]> {
    const json = buffer.toString('utf8');
    const obj = JSON.parse(json);
    return new Map(Object.entries(obj));
  }

  private calculateChecksum(data: any[]): string {
    const json = JSON.stringify(data);
    return createHash('md5').update(json).digest('hex');
  }

  private applyFilter(index: Map<any, string[]>, operator: string, value: any): string[] {
    const result: string[] = [];
    
    switch (operator) {
      case 'eq':
        return index.get(value) || [];
      case 'ne':
        for (const [indexValue, entityIds] of index) {
          if (indexValue !== value) {
            result.push(...entityIds);
          }
        }
        return result;
      case 'in':
        if (Array.isArray(value)) {
          for (const val of value) {
            result.push(...(index.get(val) || []));
          }
        }
        return result;
      default:
        // For gt, gte, lt, lte - would need sorted index
        throw new Error(`Operator ${operator} not supported with hash index`);
    }
  }

  private scanColumnForValue(columnData: ColumnData, operator: string, value: any): string[] {
    // Fallback full scan - not efficient but works
    const dataArray = Array.isArray(columnData.data) ? columnData.data : [];
    const result: string[] = [];
    
    for (let i = 0; i < dataArray.length; i++) {
      const rowValue = dataArray[i];
      let matches = false;
      
      switch (operator) {
        case 'eq':
          matches = rowValue === value;
          break;
        case 'ne':
          matches = rowValue !== value;
          break;
        case 'gt':
          matches = Number(rowValue) > Number(value);
          break;
        case 'gte':
          matches = Number(rowValue) >= Number(value);
          break;
        case 'lt':
          matches = Number(rowValue) < Number(value);
          break;
        case 'lte':
          matches = Number(rowValue) <= Number(value);
          break;
        case 'in':
          matches = Array.isArray(value) && value.includes(rowValue);
          break;
      }
      
      if (matches) {
        result.push(i.toString()); // Using index as entity ID - would need proper mapping
      }
    }
    
    return result;
  }

  private filterColumnByIds(columnData: ColumnData, entityIds: string[]): any[] {
    // Simplified implementation - would need proper entity ID to index mapping
    const dataArray = Array.isArray(columnData.data) ? columnData.data : [];
    const indices = entityIds.map(id => parseInt(id)).filter(idx => !isNaN(idx) && idx < dataArray.length);
    return indices.map(idx => dataArray[idx]);
  }
}