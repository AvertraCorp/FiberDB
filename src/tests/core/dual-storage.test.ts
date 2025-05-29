/**
 * Dual Storage System Tests
 * 
 * Comprehensive tests for the smart dual-storage system including:
 * - Columnar storage configuration
 * - Automatic query routing
 * - Data consistency between stores
 * - Performance optimizations
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EnhancedFiberDB } from '../../api/enhanced-fiberdb';
import { ColumnarEntityConfig } from '../../types/enhanced/columnar';
import { Entity } from '../../types/enhanced/entity';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Dual Storage System', () => {
  let db: EnhancedFiberDB;
  let testDataPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDataPath = path.join('/tmp', `dual-storage-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(testDataPath, { recursive: true });
    
    // Initialize database with test path
    db = new EnhancedFiberDB(testDataPath);
    await db.initialize();
  });

  afterEach(async () => {
    // Clean up test data
    await db.close();
    try {
      await fs.rm(testDataPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Columnar Storage Configuration', () => {
    test('should enable columnar storage for entity type', async () => {
      const config: ColumnarEntityConfig = {
        columns: ['revenue', 'region', 'customerClass'],
        indexes: ['region', 'customerClass'],
        compression: true,
        autoSync: true,
        syncMode: 'immediate'
      };

      await db.enableColumnarStorage('business-partner', config);
      
      // Verify configuration is stored
      const stats = await db.getStats();
      expect(stats.columnar.enabled).toBe(true);
      expect(stats.columnar.configuredEntityTypes).toContain('business-partner');
    });

    test('should configure multiple entity types', async () => {
      const configs = {
        'business-partner': {
          columns: ['revenue', 'region'],
          indexes: ['region'],
          compression: true,
          autoSync: true,
          syncMode: 'immediate' as const
        },
        'orders': {
          columns: ['amount', 'date', 'product'],
          indexes: ['date', 'product'],
          compression: false,
          autoSync: false,
          syncMode: 'batch' as const
        }
      };

      await db.configureColumnarStorage(configs);
      
      const stats = await db.getStats();
      expect(stats.columnar.configuredEntityTypes).toContain('business-partner');
      expect(stats.columnar.configuredEntityTypes).toContain('orders');
    });

    test('should add columns to existing configuration', async () => {
      // Initial configuration
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue', 'region'],
        indexes: ['region'],
        compression: true,
        autoSync: true,
        syncMode: 'immediate'
      });

      // Add new columns
      await db.addColumnarColumns('business-partner', ['customerClass', 'status']);
      
      // Verify by checking if queries work with new columns
      // This would be validated through query execution
      const stats = await db.getStats();
      expect(stats.columnar.configuredEntityTypes).toContain('business-partner');
    });

    test('should disable columnar storage', async () => {
      // Enable first
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue'],
        indexes: [],
        compression: false,
        autoSync: true,
        syncMode: 'immediate'
      });

      // Disable
      await db.disableColumnarStorage('business-partner');
      
      const stats = await db.getStats();
      expect(stats.columnar.configuredEntityTypes).not.toContain('business-partner');
    });
  });

  describe('Data Synchronization', () => {
    beforeEach(async () => {
      // Enable columnar storage for testing
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue', 'region', 'customerClass'],
        indexes: ['region', 'customerClass'],
        compression: true,
        autoSync: true,
        syncMode: 'immediate'
      });
    });

    test('should sync entity data to columnar store on save', async () => {
      const entity: Entity = {
        id: 'BP001',
        type: 'business-partner',
        attributes: {
          name: 'John Doe',
          revenue: 150000,
          region: 'Northeast',
          customerClass: 'Premium'
        },
        documents: {},
        edges: [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1
        }
      };

      await db.saveEntity(entity);
      
      // Verify entity was saved (both stores should have data)
      const retrievedEntity = await db.getEntity('business-partner', 'BP001');
      expect(retrievedEntity).not.toBeNull();
      expect(retrievedEntity!.attributes.revenue).toBe(150000);
    });

    test('should handle entity updates in both stores', async () => {
      const entity: Entity = {
        id: 'BP002',
        type: 'business-partner',
        attributes: {
          name: 'Jane Smith',
          revenue: 100000,
          region: 'West',
          customerClass: 'Standard'
        },
        documents: {},
        edges: [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1
        }
      };

      // Initial save
      await db.saveEntity(entity);
      
      // Update entity
      entity.attributes.revenue = 200000;
      entity.attributes.customerClass = 'Premium';
      entity.metadata.updated = new Date();
      entity.metadata.version = 2;
      
      await db.saveEntity(entity);
      
      // Verify update
      const updatedEntity = await db.getEntity('business-partner', 'BP002');
      expect(updatedEntity!.attributes.revenue).toBe(200000);
      expect(updatedEntity!.attributes.customerClass).toBe('Premium');
    });

    test('should remove entity from both stores', async () => {
      const entity: Entity = {
        id: 'BP003',
        type: 'business-partner',
        attributes: {
          name: 'Bob Johnson',
          revenue: 75000,
          region: 'South',
          customerClass: 'Standard'
        },
        documents: {},
        edges: [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1
        }
      };

      await db.saveEntity(entity);
      
      // Verify entity exists
      let retrievedEntity = await db.getEntity('business-partner', 'BP003');
      expect(retrievedEntity).not.toBeNull();
      
      // Delete entity
      const deleted = await db.deleteEntity('business-partner', 'BP003');
      expect(deleted).toBe(true);
      
      // Verify entity is gone
      retrievedEntity = await db.getEntity('business-partner', 'BP003');
      expect(retrievedEntity).toBeNull();
    });
  });

  describe('Query Routing', () => {
    beforeEach(async () => {
      // Setup test data with columnar storage
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue', 'region', 'customerClass'],
        indexes: ['region', 'customerClass'],
        compression: true,
        autoSync: true,
        syncMode: 'immediate'
      });

      // Create test entities
      const entities: Entity[] = [
        {
          id: 'BP001',
          type: 'business-partner',
          attributes: {
            name: 'John Doe',
            revenue: 150000,
            region: 'Northeast',
            customerClass: 'Premium'
          },
          documents: {},
          edges: [],
          metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
        },
        {
          id: 'BP002',
          type: 'business-partner',
          attributes: {
            name: 'Jane Smith',
            revenue: 200000,
            region: 'West',
            customerClass: 'Premium'
          },
          documents: {},
          edges: [],
          metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
        },
        {
          id: 'BP003',
          type: 'business-partner',
          attributes: {
            name: 'Bob Johnson',
            revenue: 75000,
            region: 'Northeast',
            customerClass: 'Standard'
          },
          documents: {},
          edges: [],
          metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
        }
      ];

      for (const entity of entities) {
        await db.saveEntity(entity);
      }
    });

    test('should use entity store for transactional queries', async () => {
      // Single entity lookup should use entity store
      const result = await db.enhancedQuery({
        primary: 'business-partner',
        id: 'BP001',
        include: ['*']
      }, { includeMetrics: true });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('BP001');
      expect(result.metadata?.executionPlan.strategy).toBe('ENTITY_ONLY');
    });

    test('should use columnar store for analytical queries', async () => {
      // Aggregation query should use columnar store
      const result = await db.enhancedQuery({
        primary: 'business-partner',
        aggregate: { revenue: 'AVG' }
      }, { includeMetrics: true });

      expect(result.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
      expect(result.data).toBeDefined();
    });

    test('should use hybrid approach for complex queries', async () => {
      // Filter + full records should use hybrid approach
      const result = await db.enhancedQuery({
        primary: 'business-partner',
        where: {
          region: 'Northeast',
          revenue: { gt: 100000 }
        },
        include: ['*']
      }, { includeMetrics: true });

      expect(result.metadata?.executionPlan.strategy).toBe('HYBRID');
      expect(result.data).toBeDefined();
    });

    test('should force specific storage strategy', async () => {
      // Force entity storage
      const entityResult = await db.enhancedQuery({
        primary: 'business-partner',
        aggregate: { revenue: 'SUM' }
      }, { forceStorage: 'entity' });

      expect(entityResult.metadata?.executionPlan.strategy).toBe('ENTITY_ONLY');

      // Force columnar storage (should work for configured entity type)
      const columnarResult = await db.enhancedQuery({
        primary: 'business-partner',
        aggregate: { revenue: 'SUM' }
      }, { forceStorage: 'columnar' });

      expect(columnarResult.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
    });
  });

  describe('Backward Compatibility', () => {
    test('should work with legacy saveAnchor API', async () => {
      const data = {
        name: 'Legacy Customer',
        revenue: 100000,
        region: 'South'
      };

      await db.saveAnchor('business-partner', 'BP999', data);
      
      // Should be retrievable with new API
      const entity = await db.getEntity('business-partner', 'BP999');
      expect(entity).not.toBeNull();
      expect(entity!.attributes.name).toBe('Legacy Customer');
    });

    test('should work with legacy query API', async () => {
      // Save some data first
      await db.saveAnchor('business-partner', 'BP998', {
        name: 'Legacy Query Test',
        revenue: 150000,
        region: 'West'
      });

      // Query with legacy API
      const results = await db.query({
        primary: 'business-partner',
        id: 'BP998'
      });

      expect(results).toHaveLength(1);
      expect(results[0].anchor.name).toBe('Legacy Query Test');
    });

    test('should handle legacy attachment API', async () => {
      // Create anchor first
      await db.saveAnchor('business-partner', 'BP997', {
        name: 'Attachment Test',
        revenue: 120000
      });

      // Add attachment
      await db.attachToAnchor('business-partner:BP997', 'contracts', {
        contractId: 'C001',
        value: 50000,
        startDate: '2024-01-01'
      });

      // Verify attachment was added
      const entity = await db.getEntity('business-partner', 'BP997');
      expect(entity).not.toBeNull();
      expect(entity!.documents.contracts).toHaveLength(1);
      expect(entity!.documents.contracts[0].contractId).toBe('C001');
    });
  });

  describe('Performance Optimizations', () => {
    beforeEach(async () => {
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue', 'region'],
        indexes: ['region'],
        compression: true,
        autoSync: true,
        syncMode: 'immediate'
      });
    });

    test('should demonstrate performance improvement for analytical queries', async () => {
      // Create larger dataset for performance testing
      const entities: Entity[] = [];
      for (let i = 0; i < 100; i++) {
        entities.push({
          id: `BP${i.toString().padStart(3, '0')}`,
          type: 'business-partner',
          attributes: {
            name: `Customer ${i}`,
            revenue: Math.floor(Math.random() * 200000) + 50000,
            region: ['Northeast', 'West', 'South', 'Central'][i % 4]
          },
          documents: {},
          edges: [],
          metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
        });
      }

      for (const entity of entities) {
        await db.saveEntity(entity);
      }

      // Measure analytical query performance
      const startTime = Date.now();
      const result = await db.enhancedQuery({
        primary: 'business-partner',
        aggregate: { revenue: 'AVG' },
        groupBy: ['region']
      }, { includeMetrics: true });
      const endTime = Date.now();

      expect(result.data).toBeDefined();
      expect(result.metadata?.executionPlan.strategy).toBe('COLUMNAR_ONLY');
      
      // Performance should be reasonable (under 100ms for this small dataset)
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(100);
    });

    test('should cache columnar data effectively', async () => {
      // Save test entity
      await db.saveEntity({
        id: 'BP_CACHE_TEST',
        type: 'business-partner',
        attributes: {
          name: 'Cache Test',
          revenue: 100000,
          region: 'Northeast'
        },
        documents: {},
        edges: [],
        metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
      });

      // First query (cache miss)
      const start1 = Date.now();
      await db.enhancedQuery({
        primary: 'business-partner',
        where: { region: 'Northeast' }
      });
      const time1 = Date.now() - start1;

      // Second query (cache hit)
      const start2 = Date.now();
      await db.enhancedQuery({
        primary: 'business-partner',
        where: { region: 'Northeast' }
      });
      const time2 = Date.now() - start2;

      // Second query should be faster (or at least not significantly slower)
      expect(time2).toBeLessThanOrEqual(time1 * 1.5); // Allow some variance
    });
  });

  describe('Data Consistency', () => {
    beforeEach(async () => {
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue', 'region'],
        indexes: ['region'],
        compression: false,
        autoSync: true,
        syncMode: 'immediate'
      });
    });

    test('should maintain consistency between stores', async () => {
      // Save entities
      const entities = [
        {
          id: 'BP_CONSISTENCY_1',
          type: 'business-partner',
          attributes: { name: 'Test 1', revenue: 100000, region: 'West' },
          documents: {},
          edges: [],
          metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
        },
        {
          id: 'BP_CONSISTENCY_2', 
          type: 'business-partner',
          attributes: { name: 'Test 2', revenue: 150000, region: 'East' },
          documents: {},
          edges: [],
          metadata: { created: new Date(), updated: new Date(), version: 1, schemaVersion: 1 }
        }
      ];

      for (const entity of entities) {
        await db.saveEntity(entity);
      }

      // Check consistency
      const consistencyReport = await db.checkConsistency();
      expect(consistencyReport.status).toBe('CONSISTENT');
      expect(consistencyReport.inconsistencies).toHaveLength(0);
    });

    test('should provide metrics for columnar storage', async () => {
      const metrics = await db.getColumnarMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.queryMetrics).toBeDefined();
      expect(metrics.storageMetrics).toBeDefined();
      expect(metrics.systemMetrics).toBeDefined();
      
      expect(typeof metrics.queryMetrics.avgQueryTime).toBe('number');
      expect(typeof metrics.storageMetrics.compressionRatio).toBe('number');
    });
  });

  describe('Error Handling', () => {
    test('should handle columnar storage errors gracefully', async () => {
      // Try to enable columnar storage with invalid configuration
      try {
        await db.enableColumnarStorage('', {
          columns: [],
          indexes: [],
          compression: false,
          autoSync: true,
          syncMode: 'immediate'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should fallback to entity store on columnar errors', async () => {
      // Configure columnar storage
      await db.enableColumnarStorage('business-partner', {
        columns: ['revenue'],
        indexes: [],
        compression: false,
        autoSync: true,
        syncMode: 'immediate'
      });

      // Force columnar error by querying non-configured entity type
      const result = await db.enhancedQuery({
        primary: 'non-configured-type',
        aggregate: { someField: 'SUM' }
      }, { includeMetrics: true });

      // Should fallback to entity store
      expect(result.metadata?.executionPlan.strategy).toBe('ENTITY_ONLY');
    });

    test('should handle non-existent entity queries', async () => {
      const result = await db.enhancedQuery({
        primary: 'business-partner',
        id: 'NON_EXISTENT_ID'
      });

      expect(result.data).toHaveLength(0);
    });
  });
});