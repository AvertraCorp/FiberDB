import { Entity, Edge } from '../../../types/enhanced/entity';
import { EnhancedQueryParams } from '../../../types/enhanced/query';

export type IndexType = 'HASH' | 'BTREE' | 'TEXT';

export interface Index {
  update(entityId: string, value: any): Promise<void>;
  remove(entityId: string): Promise<void>;
  query(condition: any): Promise<string[]>;
  getStats(): IndexStats;
}

export interface IndexStats {
  size: number;
  memoryUsage: number;
  averageQueryTime: number;
}

export class IndexManager {
  private indexes = new Map<string, Index>();
  private autoIndexFields = ['id', 'type', 'status', 'category', 'created', 'updated'];

  async createIndex(entityType: string, field: string, indexType: IndexType = 'HASH'): Promise<void> {
    const indexKey = `${entityType}.${field}`;
    
    switch (indexType) {
      case 'HASH':
        this.indexes.set(indexKey, new HashIndex());
        break;
      case 'BTREE':
        this.indexes.set(indexKey, new BTreeIndex());
        break;
      case 'TEXT':
        this.indexes.set(indexKey, new TextIndex());
        break;
    }
  }

  async updateIndexes(entity: Entity): Promise<void> {
    const entityKey = `${entity.type}:${entity.id}`;
    
    // Update attribute indexes
    for (const [field, value] of Object.entries(entity.attributes)) {
      if (this.shouldIndex(entity.type, field)) {
        await this.updateIndex(entity.type, field, entityKey, value);
      }
    }

    // Update metadata indexes
    await this.updateIndex(entity.type, 'created', entityKey, entity.metadata.created);
    await this.updateIndex(entity.type, 'updated', entityKey, entity.metadata.updated);
    await this.updateIndex(entity.type, 'version', entityKey, entity.metadata.version);

    // Update document indexes
    for (const [docType, docs] of Object.entries(entity.documents)) {
      const indexKey = `${entity.type}.documents.${docType}`;
      if (this.indexes.has(indexKey)) {
        await this.indexes.get(indexKey)!.update(entityKey, docs);
      }
    }

    // Update edge indexes
    for (const edge of entity.edges) {
      await this.updateEdgeIndexes(entityKey, edge);
    }
  }

  async updateEdgeIndexes(entityId: string, edge: Edge): Promise<void> {
    const [entityType] = entityId.split(':');
    
    // Index by edge type
    const edgeTypeIndexKey = `${entityType}.edges.${edge.type}`;
    if (!this.indexes.has(edgeTypeIndexKey)) {
      await this.createIndex(entityType, `edges.${edge.type}`, 'HASH');
    }
    await this.indexes.get(edgeTypeIndexKey)!.update(entityId, edge.target);

    // Index by target
    const edgeTargetIndexKey = `${entityType}.edges.target`;
    if (!this.indexes.has(edgeTargetIndexKey)) {
      await this.createIndex(entityType, 'edges.target', 'HASH');
    }
    await this.indexes.get(edgeTargetIndexKey)!.update(entityId, edge.target);
  }

  async findCandidates(params: EnhancedQueryParams): Promise<string[]> {
    if (!params.where) return [];

    const candidates: Set<string>[] = [];
    const entityTypes = Array.isArray(params.from) ? params.from : [params.from];

    // Check attribute filters
    if (params.where.attributes) {
      for (const entityType of entityTypes) {
        for (const [field, condition] of Object.entries(params.where.attributes)) {
          const indexKey = `${entityType}.${field}`;
          const index = this.indexes.get(indexKey);
          
          if (index) {
            const results = await index.query(condition);
            candidates.push(new Set(results));
          }
        }
      }
    }

    // Check edge filters
    if (params.where.edges) {
      for (const entityType of entityTypes) {
        if (params.where.edges.type) {
          const edgeTypes = Array.isArray(params.where.edges.type) 
            ? params.where.edges.type 
            : [params.where.edges.type];
            
          for (const edgeType of edgeTypes) {
            const indexKey = `${entityType}.edges.${edgeType}`;
            const index = this.indexes.get(indexKey);
            
            if (index) {
              const results = await index.query(params.where.edges.target);
              candidates.push(new Set(results));
            }
          }
        }
      }
    }

    // Intersect all candidate sets
    if (candidates.length === 0) return [];
    
    let result = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      result = new Set([...result].filter(x => candidates[i].has(x)));
    }

    return Array.from(result);
  }

  private async updateIndex(entityType: string, field: string, entityId: string, value: any): Promise<void> {
    const indexKey = `${entityType}.${field}`;
    
    if (!this.indexes.has(indexKey)) {
      await this.createIndex(entityType, field, this.getIndexTypeForField(field));
    }
    
    const index = this.indexes.get(indexKey);
    if (index) {
      await index.update(entityId, value);
    }
  }

  private shouldIndex(entityType: string, field: string): boolean {
    return this.autoIndexFields.includes(field) || 
           this.indexes.has(`${entityType}.${field}`);
  }

  private getIndexTypeForField(field: string): IndexType {
    if (field.includes('text') || field.includes('description') || field.includes('content')) {
      return 'TEXT';
    }
    if (field.includes('date') || field.includes('time') || field.includes('number')) {
      return 'BTREE';
    }
    return 'HASH';
  }

  async removeFromIndexes(entity: Entity): Promise<void> {
    const entityKey = `${entity.type}:${entity.id}`;
    
    // Remove from all relevant indexes
    for (const [indexKey, index] of this.indexes.entries()) {
      if (indexKey.startsWith(entity.type + '.')) {
        await index.remove(entityKey);
      }
    }
  }

  getIndexStats(): Record<string, IndexStats> {
    const stats: Record<string, IndexStats> = {};
    
    for (const [key, index] of this.indexes.entries()) {
      stats[key] = index.getStats();
    }
    
    return stats;
  }
}

// Simple hash index implementation
class HashIndex implements Index {
  private data = new Map<any, Set<string>>();
  private reverseIndex = new Map<string, any>();

  async update(entityId: string, value: any): Promise<void> {
    // Remove old value if exists
    const oldValue = this.reverseIndex.get(entityId);
    if (oldValue !== undefined) {
      const oldSet = this.data.get(oldValue);
      if (oldSet) {
        oldSet.delete(entityId);
        if (oldSet.size === 0) {
          this.data.delete(oldValue);
        }
      }
    }

    // Add new value
    if (!this.data.has(value)) {
      this.data.set(value, new Set());
    }
    this.data.get(value)!.add(entityId);
    this.reverseIndex.set(entityId, value);
  }

  async remove(entityId: string): Promise<void> {
    const value = this.reverseIndex.get(entityId);
    if (value !== undefined) {
      const set = this.data.get(value);
      if (set) {
        set.delete(entityId);
        if (set.size === 0) {
          this.data.delete(value);
        }
      }
      this.reverseIndex.delete(entityId);
    }
  }

  async query(condition: any): Promise<string[]> {
    if (typeof condition === 'object' && condition !== null) {
      // Handle complex conditions
      if (condition.$in) {
        const results = new Set<string>();
        for (const value of condition.$in) {
          const set = this.data.get(value);
          if (set) {
            set.forEach(id => results.add(id));
          }
        }
        return Array.from(results);
      }
      
      if (condition.$eq || condition === condition) {
        const value = condition.$eq !== undefined ? condition.$eq : condition;
        return Array.from(this.data.get(value) || []);
      }
    }

    // Simple equality check
    return Array.from(this.data.get(condition) || []);
  }

  getStats(): IndexStats {
    return {
      size: this.reverseIndex.size,
      memoryUsage: this.data.size * 64, // Rough estimate
      averageQueryTime: 1 // Constant time for hash index
    };
  }
}

// Simple B-tree index implementation (simplified)
class BTreeIndex implements Index {
  private sortedKeys: Array<{ value: any, entityIds: Set<string> }> = [];

  async update(entityId: string, value: any): Promise<void> {
    // Remove old entry
    await this.remove(entityId);
    
    // Find or create entry for this value
    let entry = this.sortedKeys.find(e => e.value === value);
    if (!entry) {
      entry = { value, entityIds: new Set() };
      this.sortedKeys.push(entry);
      this.sortedKeys.sort((a, b) => a.value > b.value ? 1 : -1);
    }
    
    entry.entityIds.add(entityId);
  }

  async remove(entityId: string): Promise<void> {
    for (let i = 0; i < this.sortedKeys.length; i++) {
      const entry = this.sortedKeys[i];
      if (entry.entityIds.has(entityId)) {
        entry.entityIds.delete(entityId);
        if (entry.entityIds.size === 0) {
          this.sortedKeys.splice(i, 1);
        }
        break;
      }
    }
  }

  async query(condition: any): Promise<string[]> {
    if (typeof condition === 'object' && condition !== null) {
      const results = new Set<string>();
      
      if (condition.$gte !== undefined || condition.$gt !== undefined) {
        const minValue = condition.$gte !== undefined ? condition.$gte : condition.$gt;
        const includeMin = condition.$gte !== undefined;
        
        for (const entry of this.sortedKeys) {
          if (entry.value > minValue || (includeMin && entry.value === minValue)) {
            entry.entityIds.forEach(id => results.add(id));
          }
        }
      }
      
      if (condition.$lte !== undefined || condition.$lt !== undefined) {
        const maxValue = condition.$lte !== undefined ? condition.$lte : condition.$lt;
        const includeMax = condition.$lte !== undefined;
        
        for (const entry of this.sortedKeys) {
          if (entry.value < maxValue || (includeMax && entry.value === maxValue)) {
            entry.entityIds.forEach(id => results.add(id));
          }
        }
      }
      
      return Array.from(results);
    }
    
    // Simple equality
    const entry = this.sortedKeys.find(e => e.value === condition);
    return entry ? Array.from(entry.entityIds) : [];
  }

  getStats(): IndexStats {
    return {
      size: this.sortedKeys.reduce((sum, entry) => sum + entry.entityIds.size, 0),
      memoryUsage: this.sortedKeys.length * 128,
      averageQueryTime: Math.log2(this.sortedKeys.length)
    };
  }
}

// Simple text index implementation
class TextIndex implements Index {
  private wordIndex = new Map<string, Set<string>>();
  private entityWords = new Map<string, Set<string>>();

  async update(entityId: string, value: any): Promise<void> {
    // Remove old words
    await this.remove(entityId);
    
    if (typeof value === 'string') {
      const words = this.tokenize(value);
      this.entityWords.set(entityId, new Set(words));
      
      for (const word of words) {
        if (!this.wordIndex.has(word)) {
          this.wordIndex.set(word, new Set());
        }
        this.wordIndex.get(word)!.add(entityId);
      }
    }
  }

  async remove(entityId: string): Promise<void> {
    const words = this.entityWords.get(entityId);
    if (words) {
      for (const word of words) {
        const entitySet = this.wordIndex.get(word);
        if (entitySet) {
          entitySet.delete(entityId);
          if (entitySet.size === 0) {
            this.wordIndex.delete(word);
          }
        }
      }
      this.entityWords.delete(entityId);
    }
  }

  async query(condition: any): Promise<string[]> {
    if (typeof condition === 'string') {
      const words = this.tokenize(condition);
      if (words.length === 0) return [];
      
      let results = this.wordIndex.get(words[0]) || new Set();
      
      for (let i = 1; i < words.length; i++) {
        const wordEntities = this.wordIndex.get(words[i]) || new Set();
        results = new Set([...results].filter(id => wordEntities.has(id)));
      }
      
      return Array.from(results);
    }
    
    return [];
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  getStats(): IndexStats {
    return {
      size: this.entityWords.size,
      memoryUsage: this.wordIndex.size * 64,
      averageQueryTime: 5 // Text search is more expensive
    };
  }
}