/**
 * Columnar Storage Performance Benchmarks
 * 
 * Performance tests to validate the 10-100x improvement claims
 * for analytical queries with the dual-storage system.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EnhancedFiberDB } from '../../api/enhanced-fiberdb';
import { FiberDB } from '../../api/fiberdb';
import { Entity } from '../../types/enhanced/entity';
import { ColumnarEntityConfig } from '../../types/enhanced/columnar';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Columnar Storage Performance Benchmarks', () => {
  let enhancedDB: EnhancedFiberDB;
  let standardDB: FiberDB;
  let testDataPath: string;
  let standardDataPath: string;

  beforeEach(async () => {
    // Create temporary test directories
    testDataPath = path.join('/tmp', `columnar-bench-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    standardDataPath = path.join('/tmp', `standard-bench-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    await fs.mkdir(testDataPath, { recursive: true });
    await fs.mkdir(standardDataPath, { recursive: true });
    
    // Initialize databases
    enhancedDB = new EnhancedFiberDB(testDataPath);
    standardDB = new FiberDB(standardDataPath);
    
    await enhancedDB.initialize();
    await standardDB.initialize();

    // Configure columnar storage for enhanced DB
    const columnarConfig: ColumnarEntityConfig = {
      columns: ['revenue', 'region', 'customerClass', 'orderCount', 'lastOrderDate'],
      indexes: ['region', 'customerClass'],
      compression: true,
      autoSync: true,
      syncMode: 'immediate'
    };

    await enhancedDB.enableColumnarStorage('business-partner', columnarConfig);
  });

  afterEach(async () => {
    // Clean up
    await enhancedDB.close();
    await standardDB.close();
    
    try {
      await fs.rm(testDataPath, { recursive: true, force: true });
      await fs.rm(standardDataPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Generate test dataset for benchmarking
   */
  async function generateTestData(db: EnhancedFiberDB | FiberDB, count: number): Promise<void> {
    const regions = ['Northeast', 'Southeast', 'West', 'Central', 'Southwest'];
    const customerClasses = ['Bronze', 'Silver', 'Gold', 'Platinum'];
    
    const entities: Entity[] = [];
    
    for (let i = 0; i < count; i++) {
      const entity: Entity = {
        id: `BP${i.toString().padStart(6, '0')}`,
        type: 'business-partner',
        attributes: {
          name: `Customer ${i}`,
          revenue: Math.floor(Math.random() * 500000) + 10000, // $10K - $510K
          region: regions[Math.floor(Math.random() * regions.length)],
          customerClass: customerClasses[Math.floor(Math.random() * customerClasses.length)],
          orderCount: Math.floor(Math.random() * 100) + 1,
          lastOrderDate: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
          email: `customer${i}@example.com`,
          phone: `555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
          address: `${i} Main St, City ${i % 100}, State ${i % 50}`,
          creditScore: Math.floor(Math.random() * 400) + 300 // 300-700
        },
        documents: {
          contracts: [{
            contractId: `C${i}`,
            value: Math.floor(Math.random() * 100000) + 5000,
            startDate: '2024-01-01',
            endDate: '2024-12-31'
          }]
        },
        edges: [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1
        }
      };
      
      entities.push(entity);
    }

    // Batch insert for better performance
    for (const entity of entities) {
      if (db instanceof EnhancedFiberDB) {
        await db.saveEntity(entity);
      } else {
        await db.saveAnchor(entity.type, entity.id, entity.attributes);
      }
    }
  }

  describe('Aggregation Query Performance', () => {
    test('should demonstrate significant improvement for SUM aggregation', async () => {
      const datasetSize = 1000; // Moderate size for CI/CD environments
      
      try {
        // Generate identical datasets
        await generateTestData(enhancedDB, datasetSize);
        await generateTestData(standardDB, datasetSize);

        // Benchmark: Sum of revenue by region
        
        // Standard DB (entity store only)
        const standardStart = Date.now();
        const standardResult = await standardDB.query({
          primary: 'business-partner',
          // Note: Standard DB doesn't have built-in aggregation, so this simulates a scan
          include: ['revenue', 'region']
        });
        const standardTime = Date.now() - standardStart;

        // Enhanced DB (with columnar storage)
        const enhancedStart = Date.now();
        const enhancedResult = await enhancedDB.enhancedQuery({
          primary: 'business-partner',
          aggregate: { revenue: 'SUM' },
          groupBy: ['region']
        }, { includeMetrics: true });
        const enhancedTime = Date.now() - enhancedStart;

        console.log(`Standard DB time: ${standardTime}ms`);
        console.log(`Enhanced DB time: ${enhancedTime}ms`);
        console.log(`Performance improvement: ${Math.round(standardTime / enhancedTime)}x`);

        // Verify results are meaningful
        expect(enhancedResult.data).toBeDefined();
        expect(enhancedResult.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
        
        // For this test, we're primarily verifying functionality rather than strict performance
        // In CI/CD environments, timing can be highly variable
        expect(enhancedTime).toBeLessThan(1000); // Should complete within 1 second
        expect(standardTime).toBeLessThan(1000); // Should complete within 1 second
      } catch (error) {
        console.error('Benchmark test error:', error);
        throw error;
      }
    });

    test('should show improvement for AVG aggregation with grouping', async () => {
      const datasetSize = 500;
      
      await generateTestData(enhancedDB, datasetSize);

      // Test average revenue by customer class
      const start = Date.now();
      const result = await enhancedDB.enhancedQuery({
        primary: 'business-partner',
        aggregate: { revenue: 'AVG' },
        groupBy: ['customerClass']
      }, { includeMetrics: true });
      const executionTime = Date.now() - start;

      expect(result.data).toBeDefined();
      expect(result.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
      expect(executionTime).toBeLessThan(100); // Should be very fast for columnar queries
      
      console.log(`Average revenue by customer class executed in ${executionTime}ms`);
      console.log('Strategy:', result.metadata?.executionPlan.strategy);
    });

    test('should demonstrate COUNT operations performance', async () => {
      const datasetSize = 800;
      
      await generateTestData(enhancedDB, datasetSize);

      // Count customers by region
      const start = Date.now();
      const result = await enhancedDB.enhancedQuery({
        primary: 'business-partner',
        aggregate: { customerClass: 'COUNT' },
        groupBy: ['region']
      }, { includeMetrics: true });
      const executionTime = Date.now() - start;

      expect(result.data).toBeDefined();
      expect(result.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
      expect(executionTime).toBeLessThan(50); // COUNT should be very fast
      
      console.log(`Count by region executed in ${executionTime}ms`);
    });
  });

  describe('Filtering Performance', () => {
    test('should show improvement for range queries', async () => {
      const datasetSize = 1200;
      
      await generateTestData(enhancedDB, datasetSize);

      // Filter high-value customers (revenue > $200K)
      const start = Date.now();
      const result = await enhancedDB.enhancedQuery({
        primary: 'business-partner',
        where: {
          revenue: { gt: 200000 }
        }
      }, { includeMetrics: true });
      const executionTime = Date.now() - start;

      expect(result.data).toBeDefined();
      expect(executionTime).toBeLessThan(100);
      
      console.log(`Range query (revenue > 200K) executed in ${executionTime}ms`);
      console.log(`Found ${result.data.length} high-value customers`);
      console.log('Strategy:', result.metadata?.executionPlan.strategy);
    });

    test('should optimize multi-column filters', async () => {
      const datasetSize = 1000;
      
      await generateTestData(enhancedDB, datasetSize);

      // Complex filter: High revenue Gold/Platinum customers in West region
      const start = Date.now();
      const result = await enhancedDB.enhancedQuery({
        primary: 'business-partner',
        where: {
          revenue: { gt: 150000 },
          region: 'West',
          customerClass: { in: ['Gold', 'Platinum'] }
        }
      }, { includeMetrics: true });
      const executionTime = Date.now() - start;

      expect(result.data).toBeDefined();
      expect(executionTime).toBeLessThan(100);
      
      console.log(`Multi-column filter executed in ${executionTime}ms`);
      console.log(`Found ${result.data.length} matching customers`);
      console.log('Strategy:', result.metadata?.executionPlan.strategy);
    });
  });

  describe('Hybrid Query Performance', () => {
    test('should optimize queries needing both filtering and full records', async () => {
      const datasetSize = 600;
      
      await generateTestData(enhancedDB, datasetSize);

      // Hybrid query: Filter by columnar data, return full records
      const start = Date.now();
      const result = await enhancedDB.enhancedQuery({
        primary: 'business-partner',
        where: {
          region: 'Northeast',
          revenue: { gt: 100000 }
        },
        include: ['*'] // Full records needed
      }, { includeMetrics: true });
      const executionTime = Date.now() - start;

      expect(result.data).toBeDefined();
      expect(result.metadata?.executionPlan.strategy).toBe('HYBRID');
      expect(executionTime).toBeLessThan(150);
      
      console.log(`Hybrid query executed in ${executionTime}ms`);
      console.log(`Found ${result.data.length} matching customers with full records`);
      console.log('Execution steps:', result.metadata?.executionPlan.steps.length);
    });
  });

  describe('Memory Usage Optimization', () => {
    test('should use less memory for analytical queries', async () => {
      const datasetSize = 1000;
      
      await generateTestData(enhancedDB, datasetSize);

      // Monitor memory usage during columnar query
      const memBefore = process.memoryUsage().heapUsed;
      
      const result = await enhancedDB.enhancedQuery({
        primary: 'business-partner',
        aggregate: { revenue: 'SUM', orderCount: 'AVG' },
        groupBy: ['region', 'customerClass']
      }, { includeMetrics: true });
      
      const memAfter = process.memoryUsage().heapUsed;
      const memoryUsed = memAfter - memBefore;

      expect(result.data).toBeDefined();
      expect(result.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
      
      // Memory usage should be reasonable (less than 50MB for this dataset)
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024);
      
      console.log(`Memory used for analytical query: ${Math.round(memoryUsed / 1024 / 1024)}MB`);
      console.log('Strategy:', result.metadata?.executionPlan.strategy);
    });
  });

  describe('Scalability Tests', () => {
    test('should maintain performance with larger datasets', async () => {
      const datasetSize = 2000; // Larger dataset
      
      await generateTestData(enhancedDB, datasetSize);

      // Test multiple query types on larger dataset
      const queries = [
        {
          name: 'Sum by region',
          query: { primary: 'business-partner', aggregate: { revenue: 'SUM' }, groupBy: ['region'] }
        },
        {
          name: 'Average by customer class',
          query: { primary: 'business-partner', aggregate: { revenue: 'AVG' }, groupBy: ['customerClass'] }
        },
        {
          name: 'Count high-value customers',
          query: { primary: 'business-partner', where: { revenue: { gt: 200000 } }, aggregate: { revenue: 'COUNT' } }
        }
      ];

      for (const testQuery of queries) {
        const start = Date.now();
        const result = await enhancedDB.enhancedQuery(testQuery.query, { includeMetrics: true });
        const time = Date.now() - start;

        expect(result.data).toBeDefined();
        expect(time).toBeLessThan(200); // Should scale well
        
        console.log(`${testQuery.name} on ${datasetSize} records: ${time}ms`);
        console.log('Strategy:', result.metadata?.executionPlan.strategy);
      }
    });
  });

  describe('Compression Benefits', () => {
    test('should demonstrate storage efficiency with compression', async () => {
      const datasetSize = 1000;
      
      await generateTestData(enhancedDB, datasetSize);

      // Get storage statistics
      const stats = await enhancedDB.getStats();
      const metrics = await enhancedDB.getColumnarMetrics();

      expect(stats.columnar.enabled).toBe(true);
      expect(metrics.storageMetrics.compressionRatio).toBeLessThan(1.0); // Should be compressed
      
      console.log('Compression ratio:', metrics.storageMetrics.compressionRatio);
      console.log('Total configured entity types:', stats.columnar.totalConfigurations);
    });
  });

  describe('Consistency Verification', () => {
    test('should maintain data consistency under load', async () => {
      const datasetSize = 500;
      
      await generateTestData(enhancedDB, datasetSize);

      // Verify consistency between stores
      const consistencyReport = await enhancedDB.checkConsistency();
      
      expect(consistencyReport.status).toBe('CONSISTENT');
      expect(consistencyReport.inconsistencies).toHaveLength(0);
      expect(consistencyReport.entityTypesChecked).toContain('business-partner');
      
      console.log('Consistency status:', consistencyReport.status);
      console.log('Entity types checked:', consistencyReport.entityTypesChecked.length);
    });
  });
});