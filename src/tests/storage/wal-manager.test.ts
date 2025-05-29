import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WALManager } from '../../core/storage/wal/wal-manager';
import { LogEntry } from '../../core/storage/wal/log-entry';
import { Entity } from '../../types/enhanced/entity';
import fs from 'fs';
import path from 'path';

describe('WALManager', () => {
  let walManager: WALManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/fiberdb-test-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    walManager = new WALManager(tempDir, 3); // Low threshold for testing
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should write and replay log entries', async () => {
    const testEntity: Entity = {
      id: '123',
      type: 'test',
      attributes: { name: 'test' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    const entry: LogEntry = {
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: '123',
      data: testEntity
    };

    await walManager.writeEntry(entry);
    const entities = await walManager.replay();
    
    expect(entities.has('test:123')).toBe(true);
    expect(entities.get('test:123')).toEqual(testEntity);
  });

  it('should handle update operations', async () => {
    const initialEntity: Entity = {
      id: '456',
      type: 'test',
      attributes: { name: 'initial' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    const updatedEntity: Entity = {
      ...initialEntity,
      attributes: { name: 'updated' },
      metadata: {
        ...initialEntity.metadata,
        version: 2
      }
    };

    // Insert
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: '456',
      data: initialEntity
    });

    // Update
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'UPDATE',
      entityType: 'test',
      entityId: '456',
      data: updatedEntity
    });

    const entities = await walManager.replay();
    const entity = entities.get('test:456');
    
    expect(entity).toBeTruthy();
    expect(entity!.attributes.name).toBe('updated');
    expect(entity!.metadata.version).toBe(2);
  });

  it('should handle delete operations', async () => {
    const testEntity: Entity = {
      id: '789',
      type: 'test',
      attributes: { name: 'to-delete' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    // Insert
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: '789',
      data: testEntity
    });

    // Delete
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'DELETE',
      entityType: 'test',
      entityId: '789'
    });

    const entities = await walManager.replay();
    expect(entities.has('test:789')).toBe(false);
  });

  it('should compact when threshold is reached', async () => {
    // Write exactly threshold number of entries (3) to trigger compaction
    for (let i = 0; i < 3; i++) {
      await walManager.writeEntry({
        timestamp: Date.now(),
        operation: 'INSERT',
        entityType: 'test',
        entityId: `${i}`,
        data: {
          id: `${i}`,
          type: 'test',
          attributes: { value: i },
          documents: {},
          edges: [],
          metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            version: 1,
            schemaVersion: 1
          }
        }
      });
    }

    // Check that compaction occurred by verifying WAL is cleared
    const walPath = path.join(tempDir, 'wal.log');
    const walContent = await Bun.file(walPath).text();
    expect(walContent.trim()).toBe(''); // Should be empty after compaction

    // But entities should still be recoverable
    const entities = await walManager.replay();
    expect(entities.size).toBe(3);
  });

  it('should handle edge operations', async () => {
    const testEntity: Entity = {
      id: 'edge-test',
      type: 'test',
      attributes: { name: 'edge-test' },
      documents: {},
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: 1,
        schemaVersion: 1
      }
    };

    const testEdge = {
      id: 'test-edge',
      type: 'CONNECTS_TO',
      target: 'test:target-entity',
      properties: { weight: 1 }
    };

    // Insert entity
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: 'edge-test',
      data: testEntity
    });

    // Add edge
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'ADD_EDGE',
      entityType: 'test',
      entityId: 'edge-test',
      edgeData: testEdge
    });

    const entities = await walManager.replay();
    const entity = entities.get('test:edge-test');
    
    expect(entity).toBeTruthy();
    expect(entity!.edges).toHaveLength(1);
    expect(entity!.edges[0]).toEqual(testEdge);
  });

  it('should provide accurate stats', async () => {
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: 'stats-test',
      data: {
        id: 'stats-test',
        type: 'test',
        attributes: {},
        documents: {},
        edges: [],
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          version: 1,
          schemaVersion: 1
        }
      }
    });

    const stats = await walManager.getStats();
    expect(stats.entriesInMemory).toBe(1);
    expect(stats.walSizeBytes).toBeGreaterThan(0);
  });

  it('should handle corrupted log entries gracefully', async () => {
    const walPath = path.join(tempDir, 'wal.log');
    
    // Write a valid entry
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: 'valid',
      data: {
        id: 'valid',
        type: 'test',
        attributes: {},
        documents: {},
        edges: [],
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          version: 1,
          schemaVersion: 1
        }
      }
    });

    // Manually append corrupted entry
    const fs = await import('fs/promises');
    await fs.appendFile(walPath, 'corrupted-json-entry\n');

    // Write another valid entry
    await walManager.writeEntry({
      timestamp: Date.now(),
      operation: 'INSERT',
      entityType: 'test',
      entityId: 'valid2',
      data: {
        id: 'valid2',
        type: 'test',
        attributes: {},
        documents: {},
        edges: [],
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          version: 1,
          schemaVersion: 1
        }
      }
    });

    // Should recover valid entries and skip corrupted one
    const entities = await walManager.replay();
    expect(entities.size).toBe(2);
    expect(entities.has('test:valid')).toBe(true);
    expect(entities.has('test:valid2')).toBe(true);
  });
});