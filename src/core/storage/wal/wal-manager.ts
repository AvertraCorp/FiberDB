import { Entity, Edge } from '../../../types/enhanced/entity';
import { LogEntry, WALSnapshot } from './log-entry';
import { existsSync } from 'fs';
import { join } from 'path';

export class WALManager {
  private walPath: string;
  private compactionThreshold: number;
  private entries: LogEntry[] = [];
  private lastCompaction: number = 0;

  constructor(dataPath: string, compactionThreshold: number = 1000) {
    this.walPath = join(dataPath, 'wal.log');
    this.compactionThreshold = compactionThreshold;
  }

  async writeEntry(entry: LogEntry): Promise<void> {
    // Add to memory buffer
    this.entries.push(entry);
    
    // Write to disk immediately for durability
    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      // Check if file exists to determine whether to append or create
      const fs = await import('fs/promises');
      await fs.appendFile(this.walPath, logLine);
    } catch (error) {
      // Remove from memory if disk write failed
      this.entries.pop();
      throw new Error(`Failed to write WAL entry: ${error}`);
    }
    
    // Check if compaction is needed
    if (this.entries.length >= this.compactionThreshold) {
      await this.compact();
    }
  }

  async replay(): Promise<Map<string, Entity>> {
    const entities = new Map<string, Entity>();
    
    // First, try to load from latest snapshot
    await this.loadFromSnapshot(entities);
    
    // Then replay WAL entries since snapshot
    if (existsSync(this.walPath)) {
      const walFile = Bun.file(this.walPath);
      const walContent = await walFile.text();
      
      for (const line of walContent.split('\n')) {
        if (!line.trim()) continue;
        
        try {
          const entry: LogEntry = JSON.parse(line);
          
          // Only replay entries after last compaction
          if (entry.timestamp > this.lastCompaction) {
            this.applyEntry(entities, entry);
          }
        } catch (error) {
          console.warn(`Skipping corrupted WAL entry: ${line}`);
        }
      }
    }
    
    return entities;
  }

  private async loadFromSnapshot(entities: Map<string, Entity>): Promise<void> {
    const snapshotPattern = join(this.walPath + '.snapshot.*');
    
    try {
      // Find latest snapshot file
      const snapshotFiles = await this.findSnapshotFiles();
      if (snapshotFiles.length === 0) return;
      
      const latestSnapshot = snapshotFiles.sort((a, b) => b.timestamp - a.timestamp)[0];
      const snapshotFile = Bun.file(latestSnapshot.path);
      
      if (await snapshotFile.exists()) {
        const snapshot: WALSnapshot = await snapshotFile.json();
        
        for (const [key, entity] of Object.entries(snapshot.entities)) {
          entities.set(key, entity);
        }
        
        this.lastCompaction = snapshot.timestamp;
      }
    } catch (error) {
      console.warn(`Failed to load snapshot: ${error}`);
    }
  }

  private async findSnapshotFiles(): Promise<Array<{ path: string; timestamp: number }>> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const dataDir = path.dirname(this.walPath);
      const files = await fs.readdir(dataDir);
      const snapshotFiles: Array<{ path: string; timestamp: number }> = [];
      
      for (const file of files) {
        if (file.startsWith('wal.log.snapshot.')) {
          const timestampStr = file.split('.snapshot.')[1];
          const timestamp = parseInt(timestampStr, 10);
          if (!isNaN(timestamp)) {
            snapshotFiles.push({
              path: path.join(dataDir, file),
              timestamp
            });
          }
        }
      }
      
      return snapshotFiles;
    } catch (error) {
      console.warn(`Failed to find snapshot files: ${error}`);
      return [];
    }
  }

  private applyEntry(entities: Map<string, Entity>, entry: LogEntry): void {
    const entityKey = `${entry.entityType}:${entry.entityId}`;
    
    switch (entry.operation) {
      case 'INSERT':
      case 'UPDATE':
        if (entry.data) {
          entities.set(entityKey, entry.data);
        }
        break;
        
      case 'DELETE':
        entities.delete(entityKey);
        break;
        
      case 'ADD_EDGE':
        const entity = entities.get(entityKey);
        if (entity && entry.edgeData) {
          // Remove existing edge with same ID if exists
          entity.edges = entity.edges.filter(e => e.id !== entry.edgeData!.id);
          entity.edges.push(entry.edgeData);
          entity.metadata.updated = new Date(entry.timestamp).toISOString();
        }
        break;
        
      case 'REMOVE_EDGE':
        const entityWithEdge = entities.get(entityKey);
        if (entityWithEdge && entry.edgeData) {
          entityWithEdge.edges = entityWithEdge.edges.filter(
            edge => edge.id !== entry.edgeData!.id
          );
          entityWithEdge.metadata.updated = new Date(entry.timestamp).toISOString();
        }
        break;
    }
  }

  async compact(): Promise<void> {
    try {
      // Create snapshot of current state
      const currentState = await this.replay();
      
      // Write snapshot to disk
      await this.writeSnapshot(currentState);
      
      // Clear WAL
      await this.clearWAL();
      
      // Reset in-memory entries
      this.entries = [];
      this.lastCompaction = Date.now();
      
      console.log(`WAL compaction completed. Compacted ${currentState.size} entities.`);
    } catch (error) {
      console.error(`WAL compaction failed: ${error}`);
      throw error;
    }
  }

  private async writeSnapshot(entities: Map<string, Entity>): Promise<void> {
    const timestamp = Date.now();
    const snapshotPath = `${this.walPath}.snapshot.${timestamp}`;
    
    const snapshot: WALSnapshot = {
      timestamp,
      entities: Object.fromEntries(entities),
      metadata: {
        totalEntries: entities.size,
        lastCompaction: this.lastCompaction
      }
    };
    
    await Bun.write(snapshotPath, JSON.stringify(snapshot, null, 2));
    
    // Clean up old snapshots (keep only 3 most recent)
    await this.cleanupOldSnapshots();
  }

  private async cleanupOldSnapshots(): Promise<void> {
    try {
      const snapshotFiles = await this.findSnapshotFiles();
      const sortedFiles = snapshotFiles.sort((a, b) => b.timestamp - a.timestamp);
      
      // Remove all but the 3 most recent snapshots
      for (let i = 3; i < sortedFiles.length; i++) {
        try {
          const fs = await import('fs/promises');
          await fs.unlink(sortedFiles[i].path);
        } catch (error) {
          // Silently ignore cleanup errors for tests
        }
      }
    } catch (error) {
      // Silently ignore cleanup errors for tests
    }
  }

  private async clearWAL(): Promise<void> {
    await Bun.write(this.walPath, '');
  }

  async getStats(): Promise<{
    entriesInMemory: number;
    lastCompaction: number;
    walSizeBytes: number;
  }> {
    let walSizeBytes = 0;
    
    try {
      if (existsSync(this.walPath)) {
        const fs = await import('fs/promises');
        const stats = await fs.stat(this.walPath);
        walSizeBytes = stats.size;
      }
    } catch (error) {
      console.warn(`Failed to get WAL stats: ${error}`);
    }
    
    return {
      entriesInMemory: this.entries.length,
      lastCompaction: this.lastCompaction,
      walSizeBytes
    };
  }
}