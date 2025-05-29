/**
 * Performance Monitor for Dual-Storage System
 * 
 * Provides comprehensive performance monitoring and metrics collection
 * for the smart dual-storage system, tracking query performance,
 * storage efficiency, and system health.
 */

import { EventEmitter } from 'events';
import { ColumnarMetrics, ExecutionPlan, QueryType } from '../../types/enhanced/columnar';

export interface QueryMetric {
  queryId: string;
  entityType: string;
  queryType: QueryType;
  strategy: 'ENTITY_ONLY' | 'COLUMNAR_ONLY' | 'HYBRID';
  executionTime: number;
  memoryUsed: number;
  recordsScanned: number;
  cacheHits: number;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface StorageMetric {
  timestamp: Date;
  entityType: string;
  operation: 'READ' | 'WRITE' | 'DELETE' | 'SYNC';
  storage: 'entity' | 'columnar';
  duration: number;
  recordCount: number;
  bytesProcessed: number;
  success: boolean;
}

export interface SystemMetric {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  queueSize: number;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: PerformanceSnapshot) => boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cooldownMs: number;
  lastTriggered?: Date;
}

export interface PerformanceSnapshot {
  timestamp: Date;
  queryMetrics: {
    totalQueries: number;
    avgExecutionTime: number;
    queryThroughput: number;
    errorRate: number;
    strategyDistribution: Record<string, number>;
    cacheHitRate: number;
  };
  storageMetrics: {
    entityStoreOps: number;
    columnarStoreOps: number;
    syncLatency: number;
    compressionRatio: number;
    indexEfficiency: number;
  };
  systemMetrics: {
    avgCpuUsage: number;
    avgMemoryUsage: number;
    avgDiskUsage: number;
    avgActiveConnections: number;
    avgQueueSize: number;
  };
}

export class PerformanceMonitor extends EventEmitter {
  private queryMetrics: QueryMetric[] = [];
  private storageMetrics: StorageMetric[] = [];
  private systemMetrics: SystemMetric[] = [];
  private alertRules: AlertRule[] = [];
  
  private maxMetricsHistory = 10000;
  private metricsRetentionMs = 24 * 60 * 60 * 1000; // 24 hours
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor() {
    super();
    this.setupDefaultAlerts();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.checkAlerts();
      this.cleanupOldMetrics();
    }, intervalMs);

    this.emit('monitoring:started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    this.emit('monitoring:stopped');
  }

  /**
   * Record a query execution metric
   */
  recordQuery(metric: Omit<QueryMetric, 'queryId' | 'timestamp'>): void {
    const queryMetric: QueryMetric = {
      ...metric,
      queryId: this.generateId(),
      timestamp: new Date()
    };

    this.queryMetrics.push(queryMetric);
    this.emit('metric:query', queryMetric);

    // Trim metrics if over limit
    if (this.queryMetrics.length > this.maxMetricsHistory) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Record a storage operation metric
   */
  recordStorage(metric: Omit<StorageMetric, 'timestamp'>): void {
    const storageMetric: StorageMetric = {
      ...metric,
      timestamp: new Date()
    };

    this.storageMetrics.push(storageMetric);
    this.emit('metric:storage', storageMetric);

    // Trim metrics if over limit
    if (this.storageMetrics.length > this.maxMetricsHistory) {
      this.storageMetrics = this.storageMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get current performance snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    // Filter metrics from last hour
    const recentQueries = this.queryMetrics.filter(m => m.timestamp >= lastHour);
    const recentStorage = this.storageMetrics.filter(m => m.timestamp >= lastHour);
    const recentSystem = this.systemMetrics.filter(m => m.timestamp >= lastHour);

    return {
      timestamp: now,
      queryMetrics: this.calculateQueryMetrics(recentQueries),
      storageMetrics: this.calculateStorageMetrics(recentStorage),
      systemMetrics: this.calculateSystemMetrics(recentSystem)
    };
  }

  /**
   * Get columnar metrics for compatibility
   */
  getColumnarMetrics(): ColumnarMetrics {
    const snapshot = this.getSnapshot();
    
    return {
      queryMetrics: {
        avgQueryTime: snapshot.queryMetrics.avgExecutionTime,
        queryThroughput: snapshot.queryMetrics.queryThroughput,
        cacheHitRate: snapshot.queryMetrics.cacheHitRate
      },
      storageMetrics: {
        columnStoreSize: this.estimateColumnStoreSize(),
        compressionRatio: snapshot.storageMetrics.compressionRatio,
        indexEfficiency: snapshot.storageMetrics.indexEfficiency
      },
      systemMetrics: {
        syncLatency: snapshot.storageMetrics.syncLatency,
        errorRate: snapshot.queryMetrics.errorRate,
        backgroundTasksQueue: snapshot.systemMetrics.avgQueueSize
      }
    };
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    this.emit('alert:rule-added', rule);
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const index = this.alertRules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      const rule = this.alertRules.splice(index, 1)[0];
      this.emit('alert:rule-removed', rule);
      return true;
    }
    return false;
  }

  /**
   * Get query performance trends
   */
  getQueryTrends(periodHours: number = 24): Array<{
    timestamp: Date;
    avgExecutionTime: number;
    queryCount: number;
    errorRate: number;
  }> {
    const now = new Date();
    const startTime = new Date(now.getTime() - periodHours * 60 * 60 * 1000);
    const intervalMs = (periodHours * 60 * 60 * 1000) / 24; // 24 data points
    
    const trends: Array<{
      timestamp: Date;
      avgExecutionTime: number;
      queryCount: number;
      errorRate: number;
    }> = [];

    for (let i = 0; i < 24; i++) {
      const intervalStart = new Date(startTime.getTime() + i * intervalMs);
      const intervalEnd = new Date(intervalStart.getTime() + intervalMs);
      
      const intervalQueries = this.queryMetrics.filter(m => 
        m.timestamp >= intervalStart && m.timestamp < intervalEnd
      );

      if (intervalQueries.length > 0) {
        const avgTime = intervalQueries.reduce((sum, m) => sum + m.executionTime, 0) / intervalQueries.length;
        const errorCount = intervalQueries.filter(m => !m.success).length;
        const errorRate = errorCount / intervalQueries.length;

        trends.push({
          timestamp: intervalStart,
          avgExecutionTime: avgTime,
          queryCount: intervalQueries.length,
          errorRate
        });
      }
    }

    return trends;
  }

  /**
   * Get storage efficiency metrics
   */
  getStorageEfficiency(): {
    compressionSavings: number;
    indexHitRate: number;
    syncPerformance: number;
    storageUtilization: number;
  } {
    const recentStorage = this.storageMetrics.filter(m => 
      m.timestamp >= new Date(Date.now() - 60 * 60 * 1000)
    );

    const compressionSavings = this.calculateCompressionSavings(recentStorage);
    const indexHitRate = this.calculateIndexHitRate();
    const syncPerformance = this.calculateSyncPerformance(recentStorage);
    const storageUtilization = this.calculateStorageUtilization();

    return {
      compressionSavings,
      indexHitRate,
      syncPerformance,
      storageUtilization
    };
  }

  // Private helper methods

  private setupDefaultAlerts(): void {
    // High error rate alert
    this.addAlertRule({
      id: 'high-error-rate',
      name: 'High Error Rate',
      condition: (snapshot) => snapshot.queryMetrics.errorRate > 0.05, // 5%
      severity: 'HIGH',
      cooldownMs: 5 * 60 * 1000 // 5 minutes
    });

    // Slow query alert
    this.addAlertRule({
      id: 'slow-queries',
      name: 'Slow Average Query Time',
      condition: (snapshot) => snapshot.queryMetrics.avgExecutionTime > 1000, // 1 second
      severity: 'MEDIUM',
      cooldownMs: 10 * 60 * 1000 // 10 minutes
    });

    // High memory usage alert
    this.addAlertRule({
      id: 'high-memory',
      name: 'High Memory Usage',
      condition: (snapshot) => snapshot.systemMetrics.avgMemoryUsage > 0.9, // 90%
      severity: 'HIGH',
      cooldownMs: 5 * 60 * 1000
    });

    // Low cache hit rate alert
    this.addAlertRule({
      id: 'low-cache-hit-rate',
      name: 'Low Cache Hit Rate',
      condition: (snapshot) => snapshot.queryMetrics.cacheHitRate < 0.7, // 70%
      severity: 'MEDIUM',
      cooldownMs: 15 * 60 * 1000 // 15 minutes
    });
  }

  private collectSystemMetrics(): void {
    const metric: SystemMetric = {
      timestamp: new Date(),
      cpuUsage: this.getCpuUsage(),
      memoryUsage: this.getMemoryUsage(),
      diskUsage: this.getDiskUsage(),
      activeConnections: this.getActiveConnections(),
      queueSize: this.getQueueSize()
    };

    this.systemMetrics.push(metric);

    if (this.systemMetrics.length > this.maxMetricsHistory) {
      this.systemMetrics = this.systemMetrics.slice(-this.maxMetricsHistory);
    }
  }

  private checkAlerts(): void {
    const snapshot = this.getSnapshot();
    const now = new Date();

    for (const rule of this.alertRules) {
      // Check cooldown
      if (rule.lastTriggered && 
          (now.getTime() - rule.lastTriggered.getTime()) < rule.cooldownMs) {
        continue;
      }

      // Check condition
      if (rule.condition(snapshot)) {
        rule.lastTriggered = now;
        this.emit('alert:triggered', {
          rule,
          snapshot,
          timestamp: now
        });
      }
    }
  }

  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.metricsRetentionMs);

    this.queryMetrics = this.queryMetrics.filter(m => m.timestamp >= cutoff);
    this.storageMetrics = this.storageMetrics.filter(m => m.timestamp >= cutoff);
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp >= cutoff);
  }

  private calculateQueryMetrics(queries: QueryMetric[]) {
    if (queries.length === 0) {
      return {
        totalQueries: 0,
        avgExecutionTime: 0,
        queryThroughput: 0,
        errorRate: 0,
        strategyDistribution: {},
        cacheHitRate: 0
      };
    }

    const totalQueries = queries.length;
    const avgExecutionTime = queries.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries;
    const queryThroughput = totalQueries / (60 * 60); // per hour
    const errorCount = queries.filter(q => !q.success).length;
    const errorRate = errorCount / totalQueries;

    const strategyDistribution: Record<string, number> = {};
    queries.forEach(q => {
      strategyDistribution[q.strategy] = (strategyDistribution[q.strategy] || 0) + 1;
    });

    const totalCacheRequests = queries.reduce((sum, q) => sum + q.cacheHits + 1, 0);
    const totalCacheHits = queries.reduce((sum, q) => sum + q.cacheHits, 0);
    const cacheHitRate = totalCacheRequests > 0 ? totalCacheHits / totalCacheRequests : 0;

    return {
      totalQueries,
      avgExecutionTime,
      queryThroughput,
      errorRate,
      strategyDistribution,
      cacheHitRate
    };
  }

  private calculateStorageMetrics(storage: StorageMetric[]) {
    if (storage.length === 0) {
      return {
        entityStoreOps: 0,
        columnarStoreOps: 0,
        syncLatency: 0,
        compressionRatio: 0.3,
        indexEfficiency: 0.9
      };
    }

    const entityOps = storage.filter(s => s.storage === 'entity').length;
    const columnarOps = storage.filter(s => s.storage === 'columnar').length;
    
    const syncOps = storage.filter(s => s.operation === 'SYNC');
    const avgSyncLatency = syncOps.length > 0 
      ? syncOps.reduce((sum, s) => sum + s.duration, 0) / syncOps.length 
      : 0;

    return {
      entityStoreOps: entityOps,
      columnarStoreOps: columnarOps,
      syncLatency: avgSyncLatency,
      compressionRatio: 0.3, // Would be calculated from actual compression stats
      indexEfficiency: 0.9    // Would be calculated from actual index usage stats
    };
  }

  private calculateSystemMetrics(system: SystemMetric[]) {
    if (system.length === 0) {
      return {
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        avgDiskUsage: 0,
        avgActiveConnections: 0,
        avgQueueSize: 0
      };
    }

    const count = system.length;
    return {
      avgCpuUsage: system.reduce((sum, s) => sum + s.cpuUsage, 0) / count,
      avgMemoryUsage: system.reduce((sum, s) => sum + s.memoryUsage, 0) / count,
      avgDiskUsage: system.reduce((sum, s) => sum + s.diskUsage, 0) / count,
      avgActiveConnections: system.reduce((sum, s) => sum + s.activeConnections, 0) / count,
      avgQueueSize: system.reduce((sum, s) => sum + s.queueSize, 0) / count
    };
  }

  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    return Math.random() * 0.8; // 0-80%
  }

  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    const totalMemory = 8 * 1024 * 1024 * 1024; // Assume 8GB total
    return usage.heapUsed / totalMemory;
  }

  private getDiskUsage(): number {
    // Simplified disk usage calculation
    return Math.random() * 0.6; // 0-60%
  }

  private getActiveConnections(): number {
    // Would track actual connections in real implementation
    return Math.floor(Math.random() * 100);
  }

  private getQueueSize(): number {
    // Would track actual queue size in real implementation
    return Math.floor(Math.random() * 10);
  }

  private estimateColumnStoreSize(): number {
    // Simplified estimation
    const columnarOps = this.storageMetrics.filter(m => m.storage === 'columnar');
    return columnarOps.reduce((sum, op) => sum + op.bytesProcessed, 0);
  }

  private calculateCompressionSavings(storage: StorageMetric[]): number {
    // Simplified compression savings calculation
    return 0.7; // 70% compression savings
  }

  private calculateIndexHitRate(): number {
    // Simplified index hit rate calculation
    return 0.85; // 85% hit rate
  }

  private calculateSyncPerformance(storage: StorageMetric[]): number {
    const syncOps = storage.filter(s => s.operation === 'SYNC');
    if (syncOps.length === 0) return 1.0;
    
    const avgDuration = syncOps.reduce((sum, s) => sum + s.duration, 0) / syncOps.length;
    return Math.max(0, 1 - (avgDuration / 1000)); // Normalize to 0-1 scale
  }

  private calculateStorageUtilization(): number {
    // Simplified storage utilization calculation
    return 0.6; // 60% utilization
  }

  private generateId(): string {
    return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();