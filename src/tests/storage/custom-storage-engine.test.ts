import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CustomStorageEngine } from '../../core/storage/engines/custom-storage-engine';
import { Entity, Edge } from '../../types/enhanced/entity';
import { EnhancedQueryParams } from '../../types/enhanced/query';
import fs from 'fs';

describe('CustomStorageEngine Integration', () => {
  let engine: CustomStorageEngine;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/fiberdb-test-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    engine = new CustomStorageEngine(tempDir);
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should save and retrieve entities', async () => {
    const entity: Entity = {
      id: 'test-1',
      type: 'test',
      attributes: { name: 'Test Entity', value: 42 },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    await engine.saveEntity(entity);
    const retrieved = await engine.getEntity('test', 'test-1');

    expect(retrieved).toBeTruthy();
    expect(retrieved!.id).toBe('test-1');
    expect(retrieved!.attributes.name).toBe('Test Entity');
    expect(retrieved!.attributes.value).toBe(42);
  });

  it('should handle concurrent operations', async () => {
    const entities: Entity[] = [];
    
    // Create multiple entities
    for (let i = 0; i < 10; i++) {
      entities.push({
        id: `concurrent-${i}`,
        type: 'test',
        attributes: { name: `Test ${i}`, index: i },
        documents: {},
        edges: [],
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          version: 1,
          schemaVersion: 1
        }
      });
    }

    // Save concurrently
    const promises = entities.map(entity => engine.saveEntity(entity));
    await Promise.all(promises);

    // Verify all entities were saved
    for (let i = 0; i < 10; i++) {
      const saved = await engine.getEntity('test', `concurrent-${i}`);
      expect(saved).toBeTruthy();
      expect(saved!.attributes.name).toBe(`Test ${i}`);
      expect(saved!.attributes.index).toBe(i);
    }
  });

  it('should recover from restart', async () => {
    const entity: Entity = {
      id: 'restart-test',
      type: 'test',
      attributes: { name: 'Before Restart' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    await engine.saveEntity(entity);

    // Close and create new engine instance
    await engine.close();
    
    const newEngine = new CustomStorageEngine(tempDir);
    await newEngine.initialize();

    // Verify entity is recovered
    const recovered = await newEngine.getEntity('test', 'restart-test');
    expect(recovered).toBeTruthy();
    expect(recovered!.attributes.name).toBe('Before Restart');

    await newEngine.close();
  });

  it('should handle entity updates', async () => {
    const entity: Entity = {
      id: 'update-test',
      type: 'test',
      attributes: { name: 'Original', version: 1 },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    // Save initial entity
    await engine.saveEntity(entity);

    // Update entity
    entity.attributes.name = 'Updated';
    entity.attributes.version = 2;
    await engine.saveEntity(entity);

    // Retrieve and verify
    const updated = await engine.getEntity('test', 'update-test');
    expect(updated).toBeTruthy();
    expect(updated!.attributes.name).toBe('Updated');
    expect(updated!.attributes.version).toBe(2);
    expect(updated!.metadata.version).toBe(3); // Metadata version increments on each save (initial + update)
  });

  it('should handle entity deletion', async () => {
    const entity: Entity = {
      id: 'delete-test',
      type: 'test',
      attributes: { name: 'To Delete' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    await engine.saveEntity(entity);
    
    // Verify it exists
    let retrieved = await engine.getEntity('test', 'delete-test');
    expect(retrieved).toBeTruthy();

    // Delete it
    const deleted = await engine.deleteEntity('test', 'delete-test');
    expect(deleted).toBe(true);

    // Verify it's gone
    retrieved = await engine.getEntity('test', 'delete-test');
    expect(retrieved).toBeNull();

    // Try to delete again
    const deletedAgain = await engine.deleteEntity('test', 'delete-test');
    expect(deletedAgain).toBe(false);
  });

  it('should manage edges correctly', async () => {
    // Create source entity
    const sourceEntity: Entity = {
      id: 'source',
      type: 'test',
      attributes: { name: 'Source' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    await engine.saveEntity(sourceEntity);

    // Add edge
    const edge: Edge = {
      id: 'test-edge',
      type: 'CONNECTS_TO',
      target: 'test:target',
      properties: { weight: 5 }
    };

    await engine.addEdge('test', 'source', edge);

    // Retrieve and verify edge was added
    const updated = await engine.getEntity('test', 'source');
    expect(updated).toBeTruthy();
    expect(updated!.edges).toHaveLength(1);
    expect(updated!.edges[0]).toEqual(edge);

    // Remove edge
    const removed = await engine.removeEdge('test', 'source', 'test-edge');
    expect(removed).toBe(true);

    // Verify edge was removed
    const final = await engine.getEntity('test', 'source');
    expect(final).toBeTruthy();
    expect(final!.edges).toHaveLength(0);
  });

  it('should execute basic queries', async () => {
    // Create test entities
    const entities: Entity[] = [
      {
        id: 'query-1',
        type: 'product',
        attributes: { name: 'Product A', category: 'electronics', price: 100 },
        documents: {},
        edges: [],
        metadata: { created: new Date().toISOString(), updated: new Date().toISOString(), version: 1, schemaVersion: 1 }
      },
      {
        id: 'query-2',
        type: 'product',
        attributes: { name: 'Product B', category: 'electronics', price: 200 },
        documents: {},
        edges: [],
        metadata: { created: new Date().toISOString(), updated: new Date().toISOString(), version: 1, schemaVersion: 1 }
      },
      {
        id: 'query-3',
        type: 'product',
        attributes: { name: 'Product C', category: 'books', price: 50 },
        documents: {},
        edges: [],
        metadata: { created: new Date().toISOString(), updated: new Date().toISOString(), version: 1, schemaVersion: 1 }
      }
    ];

    for (const entity of entities) {
      await engine.saveEntity(entity);
    }

    // Query by type
    const allProducts = await engine.query({
      from: 'product'
    });
    expect(allProducts.entities).toHaveLength(3);

    // Query with filter
    const electronics = await engine.query({
      from: 'product',
      where: {
        attributes: { category: 'electronics' }
      }
    });
    expect(electronics.entities).toHaveLength(2);

    // Query with pagination
    const paginated = await engine.query({
      from: 'product',
      limit: 2,
      offset: 0
    });
    expect(paginated.entities).toHaveLength(2);
    expect(paginated.metadata.total).toBe(3);
  });

  it('should handle documents correctly', async () => {
    const entity: Entity = {
      id: 'doc-test',
      type: 'test',
      attributes: { name: 'Document Test' },
      documents: {
        logs: [
          { timestamp: new Date().toISOString(), message: 'Log 1' },
          { timestamp: new Date().toISOString(), message: 'Log 2' }
        ],
        notes: [
          { author: 'user1', content: 'Note 1' }
        ]
      },
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    await engine.saveEntity(entity);

    const retrieved = await engine.getEntity('test', 'doc-test');
    expect(retrieved).toBeTruthy();
    expect(retrieved!.documents.logs).toHaveLength(2);
    expect(retrieved!.documents.notes).toHaveLength(1);
    expect(retrieved!.documents.logs[0].message).toBe('Log 1');
    expect(retrieved!.documents.notes[0].author).toBe('user1');
  });

  it('should provide accurate statistics', async () => {
    // Create some test data
    for (let i = 0; i < 5; i++) {
      const entity: Entity = {
        id: `stats-${i}`,
        type: 'test',
        attributes: { name: `Test ${i}` },
        documents: {},
        edges: [{
          id: `edge-${i}`,
          type: 'TEST_EDGE',
          target: `test:target-${i}`
        }],
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          version: 1,
          schemaVersion: 1
        }
      };
      await engine.saveEntity(entity);
    }

    const stats = await engine.getStats();
    expect(stats.totalEntities).toBe(5);
    expect(stats.totalEdges).toBe(5);
    expect(stats.storageSize).toBeGreaterThan(0);
  });

  it('should find paths between entities', async () => {
    // Create a simple graph: A -> B -> C
    const entityA: Entity = {
      id: 'A',
      type: 'node',
      attributes: { name: 'Node A' },
      documents: {},
      edges: [{
        id: 'A-to-B',
        type: 'CONNECTS',
        target: 'node:B'
      }],
      metadata: { created: new Date().toISOString(), updated: new Date().toISOString(), version: 1, schemaVersion: 1 }
    };

    const entityB: Entity = {
      id: 'B',
      type: 'node',
      attributes: { name: 'Node B' },
      documents: {},
      edges: [{
        id: 'B-to-C',
        type: 'CONNECTS',
        target: 'node:C'
      }],
      metadata: { created: new Date().toISOString(), updated: new Date().toISOString(), version: 1, schemaVersion: 1 }
    };

    const entityC: Entity = {
      id: 'C',
      type: 'node',
      attributes: { name: 'Node C' },
      documents: {},
      edges: [],
      metadata: { created: new Date().toISOString(), updated: new Date().toISOString(), version: 1, schemaVersion: 1 }
    };

    await Promise.all([
      engine.saveEntity(entityA),
      engine.saveEntity(entityB),
      engine.saveEntity(entityC)
    ]);

    const paths = await engine.findPaths('node:A', 'node:C', 3);
    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toEqual(['node:A', 'node:B', 'node:C']);
    expect(paths[0].length).toBe(2);
  });
});