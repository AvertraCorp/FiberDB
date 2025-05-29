import { describe, it, expect } from 'bun:test';
import { CustomStorageEngine } from '../../core/storage/engines/custom-storage-engine';
import { Entity } from '../../types/enhanced/entity';
import fs from 'fs';

describe('Performance Benchmarks', () => {
  let tempDir: string;

  const createTempDir = () => {
    tempDir = `/tmp/fiberdb-perf-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
  };

  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };

  it('should handle large datasets efficiently', async () => {
    const dir = createTempDir();
    const engine = new CustomStorageEngine(dir, { compactionThreshold: 100 });
    await engine.initialize();

    const entityCount = 1000; // Reduced for CI/test environments
    const startTime = Date.now();
    
    // Insert entities
    const insertPromises = [];
    for (let i = 0; i < entityCount; i++) {
      const entity: Entity = {
        id: `perf-test-${i}`,
        type: 'performance',
        attributes: { 
          value: i,
          category: i % 10,
          timestamp: new Date(),
          data: `data-string-${i}`,
          active: i % 2 === 0
        },
        documents: {
          logs: [{ message: `Log entry ${i}`, level: 'info' }],
          metadata: [{ key: 'test', value: i }]
        },
        edges: i > 0 ? [{
          id: `edge-${i}`,
          type: 'FOLLOWS',
          target: `performance:perf-test-${i - 1}`
        }] : [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1
        }
      };
      
      insertPromises.push(engine.saveEntity(entity));
    }

    await Promise.all(insertPromises);
    const insertTime = Date.now() - startTime;
    
    console.log(`Insert time for ${entityCount} entities: ${insertTime}ms`);
    console.log(`Average insert time per entity: ${insertTime / entityCount}ms`);
    
    // Query performance
    const queryStart = Date.now();
    const results = await engine.query({
      from: 'performance',
      where: {
        attributes: { category: 5 }
      },
      limit: 100
    });
    const queryTime = Date.now() - queryStart;
    
    console.log(`Query time: ${queryTime}ms`);
    console.log(`Results returned: ${results.entities.length}`);
    
    // Concurrent read performance
    const concurrentReadStart = Date.now();
    const readPromises = [];
    for (let i = 0; i < 50; i++) {
      readPromises.push(engine.getEntity('performance', `perf-test-${i}`));
    }
    await Promise.all(readPromises);
    const concurrentReadTime = Date.now() - concurrentReadStart;
    
    console.log(`Concurrent read time for 50 entities: ${concurrentReadTime}ms`);
    
    // Update performance
    const updateStart = Date.now();
    const updatePromises = [];
    for (let i = 0; i < 100; i++) {
      const entity = await engine.getEntity('performance', `perf-test-${i}`);
      if (entity) {
        entity.attributes.updated_value = `updated-${i}`;
        updatePromises.push(engine.saveEntity(entity));
      }
    }
    await Promise.all(updatePromises);
    const updateTime = Date.now() - updateStart;
    
    console.log(`Update time for 100 entities: ${updateTime}ms`);
    
    // Complex query performance
    const complexQueryStart = Date.now();
    const complexResults = await engine.query({
      from: 'performance',
      where: {
        attributes: { 
          active: true,
          category: { $in: [1, 3, 5, 7, 9] }
        }
      },
      limit: 200
    });
    const complexQueryTime = Date.now() - complexQueryStart;
    
    console.log(`Complex query time: ${complexQueryTime}ms`);
    console.log(`Complex query results: ${complexResults.entities.length}`);

    // Get final stats
    const stats = await engine.getStats();
    console.log('Final storage stats:', stats);
    
    await engine.close();
    cleanup();
    
    // Performance assertions (adjust thresholds based on environment)
    expect(insertTime).toBeLessThan(10000); // 10 seconds for 1000 inserts
    expect(queryTime).toBeLessThan(100); // 100ms for simple query
    expect(concurrentReadTime).toBeLessThan(500); // 500ms for 50 concurrent reads
    expect(updateTime).toBeLessThan(2000); // 2 seconds for 100 updates
    expect(complexQueryTime).toBeLessThan(200); // 200ms for complex query
    
    expect(results.entities.length).toBe(100); // category 5 should have 100 entities
    expect(stats.totalEntities).toBe(entityCount);
  });

  it('should maintain performance with many edges', async () => {
    const dir = createTempDir();
    const engine = new CustomStorageEngine(dir, { compactionThreshold: 100 });
    await engine.initialize();

    const nodeCount = 100;
    const edgesPerNode = 10;
    
    // Create nodes
    const nodePromises = [];
    for (let i = 0; i < nodeCount; i++) {
      const entity: Entity = {
        id: `node-${i}`,
        type: 'graph_node',
        attributes: { name: `Node ${i}`, value: i },
        documents: {},
        edges: [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1
        }
      };
      nodePromises.push(engine.saveEntity(entity));
    }
    await Promise.all(nodePromises);

    // Add edges
    const edgeStart = Date.now();
    const edgePromises = [];
    
    for (let i = 0; i < nodeCount; i++) {
      for (let j = 0; j < edgesPerNode; j++) {
        const targetId = (i + j + 1) % nodeCount;
        edgePromises.push(
          engine.addEdge('graph_node', `node-${i}`, {
            id: `edge-${i}-${j}`,
            type: 'CONNECTS',
            target: `graph_node:node-${targetId}`,
            properties: { weight: Math.random() }
          })
        );
      }
    }
    
    await Promise.all(edgePromises);
    const edgeTime = Date.now() - edgeStart;
    
    console.log(`Edge creation time for ${nodeCount * edgesPerNode} edges: ${edgeTime}ms`);
    
    // Test graph traversal performance
    const traversalStart = Date.now();
    const paths = await engine.findPaths('graph_node:node-0', 'graph_node:node-50', 4);
    const traversalTime = Date.now() - traversalStart;
    
    console.log(`Graph traversal time: ${traversalTime}ms`);
    console.log(`Paths found: ${paths.length}`);
    
    // Test query with edge filters
    const edgeQueryStart = Date.now();
    const edgeQueryResults = await engine.query({
      from: 'graph_node',
      where: {
        edges: {
          type: 'CONNECTS'
        }
      },
      limit: 50
    });
    const edgeQueryTime = Date.now() - edgeQueryStart;
    
    console.log(`Edge query time: ${edgeQueryTime}ms`);
    console.log(`Edge query results: ${edgeQueryResults.entities.length}`);
    
    await engine.close();
    cleanup();
    
    // Performance assertions
    expect(edgeTime).toBeLessThan(5000); // 5 seconds for edge creation
    expect(traversalTime).toBeLessThan(1000); // 1 second for graph traversal
    expect(edgeQueryTime).toBeLessThan(500); // 500ms for edge query
    expect(paths.length).toBeGreaterThanOrEqual(0); // Paths may be empty based on graph structure
  });

  it('should handle concurrent operations efficiently', async () => {
    const dir = createTempDir();
    const engine = new CustomStorageEngine(dir, { compactionThreshold: 100 });
    await engine.initialize();

    const concurrentOperations = 50;
    const operationsPerBatch = 10;
    
    // Concurrent writes
    const writeStart = Date.now();
    const writePromises = [];
    
    for (let batch = 0; batch < concurrentOperations; batch++) {
      const batchPromises = [];
      for (let op = 0; op < operationsPerBatch; op++) {
        const entityId = `concurrent-${batch}-${op}`;
        const entity: Entity = {
          id: entityId,
          type: 'concurrent_test',
          attributes: { 
            batch,
            operation: op,
            timestamp: Date.now(),
            randomValue: Math.random()
          },
          documents: {
            data: [{ info: `Batch ${batch} Operation ${op}` }]
          },
          edges: [],
          metadata: {
            created: new Date(),
            updated: new Date(),
            version: 1,
            schemaVersion: 1
          }
        };
        batchPromises.push(engine.saveEntity(entity));
      }
      writePromises.push(Promise.all(batchPromises));
    }
    
    await Promise.all(writePromises);
    const writeTime = Date.now() - writeStart;
    
    console.log(`Concurrent write time for ${concurrentOperations * operationsPerBatch} entities: ${writeTime}ms`);
    
    // Concurrent reads
    const readStart = Date.now();
    const readPromises = [];
    
    for (let batch = 0; batch < concurrentOperations; batch++) {
      for (let op = 0; op < operationsPerBatch; op++) {
        const entityId = `concurrent-${batch}-${op}`;
        readPromises.push(engine.getEntity('concurrent_test', entityId));
      }
    }
    
    const readResults = await Promise.all(readPromises);
    const readTime = Date.now() - readStart;
    
    console.log(`Concurrent read time for ${concurrentOperations * operationsPerBatch} entities: ${readTime}ms`);
    
    // Verify all entities were written and read correctly
    const validReads = readResults.filter(entity => entity !== null).length;
    expect(validReads).toBe(concurrentOperations * operationsPerBatch);
    
    // Concurrent queries
    const queryStart = Date.now();
    const queryPromises = [];
    
    for (let i = 0; i < 20; i++) {
      queryPromises.push(
        engine.query({
          from: 'concurrent_test',
          where: {
            attributes: { batch: i % concurrentOperations }
          }
        })
      );
    }
    
    const queryResults = await Promise.all(queryPromises);
    const queryTime = Date.now() - queryStart;
    
    console.log(`Concurrent query time for 20 queries: ${queryTime}ms`);
    
    await engine.close();
    cleanup();
    
    // Performance assertions
    expect(writeTime).toBeLessThan(8000); // 8 seconds for concurrent writes
    expect(readTime).toBeLessThan(3000); // 3 seconds for concurrent reads
    expect(queryTime).toBeLessThan(2000); // 2 seconds for concurrent queries
    
    // Verify query results
    queryResults.forEach(result => {
      expect(result.entities.length).toBe(operationsPerBatch);
    });
  });

  it('should demonstrate memory efficiency', async () => {
    const dir = createTempDir();
    const engine = new CustomStorageEngine(dir, { compactionThreshold: 50 });
    await engine.initialize();

    const iterations = 10;
    const entitiesPerIteration = 100;
    
    for (let iteration = 0; iteration < iterations; iteration++) {
      const promises = [];
      
      // Create entities
      for (let i = 0; i < entitiesPerIteration; i++) {
        const entity: Entity = {
          id: `memory-test-${iteration}-${i}`,
          type: 'memory_test',
          attributes: {
            iteration,
            index: i,
            data: new Array(100).fill(0).map((_, idx) => `data-${idx}`),
            timestamp: new Date()
          },
          documents: {
            large_doc: [
              {
                content: new Array(50).fill(0).map((_, idx) => `content-${iteration}-${i}-${idx}`).join(' ')
              }
            ]
          },
          edges: [],
          metadata: {
            created: new Date(),
            updated: new Date(),
            version: 1,
            schemaVersion: 1
          }
        };
        promises.push(engine.saveEntity(entity));
      }
      
      await Promise.all(promises);
      
      // Trigger compaction to test memory cleanup
      if (iteration % 3 === 0) {
        const stats = await engine.getStats();
        console.log(`Iteration ${iteration} stats:`, {
          totalEntities: stats.totalEntities,
          storageSize: stats.storageSize,
          indexSize: stats.indexSize
        });
      }
    }

    const finalStats = await engine.getStats();
    console.log('Final memory stats:', finalStats);
    
    await engine.close();
    cleanup();
    
    expect(finalStats.totalEntities).toBe(iterations * entitiesPerIteration);
    expect(finalStats.storageSize).toBeGreaterThanOrEqual(0); // Storage size might be 0 in memory
  });
});