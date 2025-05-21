// index-manager.ts - Main API for FiberDB index operations
import fs from 'fs';
import path from 'path';
import { performanceTracker } from '../utils/performance';
import { 
  IndexDefinition, 
  IndexSet, 
  IndexType, 
  IndexTarget,
  IndexEntry,
  IndexStats
} from './index-types';

// Base directory for storing indexes
const INDEX_BASE_DIR = 'data/indexes';

// Statistics for index usage
const indexStats: Map<string, IndexStats> = new Map();

/**
 * Ensure index directory exists
 */
function ensureIndexDir(indexType: IndexType) {
  const dir = path.join(INDEX_BASE_DIR, indexType.toString());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get path for an index file
 */
function getIndexPath(indexDef: IndexDefinition): string {
  const dir = ensureIndexDir(indexDef.type);
  return path.join(dir, `${indexDef.id}.idx`);
}

/**
 * Create a new index with the given definition
 */
export async function createIndex(definition: IndexDefinition): Promise<boolean> {
  performanceTracker.start(`CreateIndex ${definition.id}`);
  
  try {
    // Ensure the index doesn't already exist
    const indexPath = getIndexPath(definition);
    if (fs.existsSync(indexPath)) {
      performanceTracker.addDetail("error", "Index already exists");
      performanceTracker.end();
      throw new Error(`Index ${definition.id} already exists`);
    }
    
    // Create initial empty index structure
    const indexSet: IndexSet = {
      definition,
      entries: [],
      lastUpdated: Date.now(),
      stats: {
        totalEntries: 0,
        uniqueValues: 0,
        sizeBytes: 0
      }
    };
    
    // Ensure directory exists and save the index definition
    ensureIndexDir(definition.type);
    fs.writeFileSync(indexPath, JSON.stringify(indexSet, null, 2));
    
    // Create initial stats for this index
    indexStats.set(definition.id, {
      id: definition.id,
      hits: 0,
      totalLookupTime: 0,
      avgLookupTime: 0,
      lastUsed: 0
    });
    
    const metrics = performanceTracker.end();
    return true;
  } catch (error) {
    console.error(`Error creating index ${definition.id}:`, error);
    performanceTracker.end();
    return false;
  }
}

/**
 * Load an index from disk
 */
export function loadIndex(indexId: string): IndexSet | null {
  try {
    // Find the index by ID by checking all index type directories
    for (const type of Object.values(IndexType)) {
      const dir = path.join(INDEX_BASE_DIR, type.toString());
      if (!fs.existsSync(dir)) continue;
      
      const indexPath = path.join(dir, `${indexId}.idx`);
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf8');
        return JSON.parse(content) as IndexSet;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error loading index ${indexId}:`, error);
    return null;
  }
}

/**
 * Save an index to disk
 */
export function saveIndex(indexSet: IndexSet): boolean {
  try {
    const indexPath = getIndexPath(indexSet.definition);
    
    // Update stats before saving
    indexSet.lastUpdated = Date.now();
    indexSet.stats.totalEntries = indexSet.entries.reduce(
      (sum, entry) => sum + entry.entities.length, 0
    );
    indexSet.stats.uniqueValues = indexSet.entries.length;
    
    // Approximate size calculation
    const serialized = JSON.stringify(indexSet);
    indexSet.stats.sizeBytes = serialized.length;
    
    // Write to disk
    fs.writeFileSync(indexPath, serialized);
    return true;
  } catch (error) {
    console.error(`Error saving index ${indexSet.definition.id}:`, error);
    return false;
  }
}

/**
 * Update index entries by adding a new mapping
 */
export function updateIndex(
  indexId: string, 
  value: any, 
  entityId: string
): boolean {
  try {
    // Load the current index
    const indexSet = loadIndex(indexId);
    if (!indexSet) {
      throw new Error(`Index ${indexId} not found`);
    }
    
    // Find existing entry for this value or create a new one
    let entry = indexSet.entries.find(e => e.value === value);
    if (!entry) {
      entry = { value, entities: [] };
      indexSet.entries.push(entry);
    }
    
    // Add the entity ID if not already present
    if (!entry.entities.includes(entityId)) {
      entry.entities.push(entityId);
    }
    
    // Save the updated index
    return saveIndex(indexSet);
  } catch (error) {
    console.error(`Error updating index ${indexId}:`, error);
    return false;
  }
}

/**
 * Remove an entity from an index
 */
export function removeFromIndex(
  indexId: string,
  entityId: string
): boolean {
  try {
    // Load the current index
    const indexSet = loadIndex(indexId);
    if (!indexSet) {
      throw new Error(`Index ${indexId} not found`);
    }
    
    // Remove entity ID from all entries
    let modified = false;
    for (const entry of indexSet.entries) {
      const idxToRemove = entry.entities.indexOf(entityId);
      if (idxToRemove >= 0) {
        entry.entities.splice(idxToRemove, 1);
        modified = true;
      }
    }
    
    // Filter out any entries with empty entity lists
    indexSet.entries = indexSet.entries.filter(e => e.entities.length > 0);
    
    // Save if changes were made
    if (modified) {
      return saveIndex(indexSet);
    }
    return true;
  } catch (error) {
    console.error(`Error removing entity from index ${indexId}:`, error);
    return false;
  }
}

/**
 * Delete an index completely
 */
export function deleteIndex(indexId: string): boolean {
  try {
    // Find the index by ID by checking all index type directories
    for (const type of Object.values(IndexType)) {
      const dir = path.join(INDEX_BASE_DIR, type.toString());
      if (!fs.existsSync(dir)) continue;
      
      const indexPath = path.join(dir, `${indexId}.idx`);
      if (fs.existsSync(indexPath)) {
        fs.unlinkSync(indexPath);
        
        // Clear stats for this index
        indexStats.delete(indexId);
        return true;
      }
    }
    
    // Index not found
    return false;
  } catch (error) {
    console.error(`Error deleting index ${indexId}:`, error);
    return false;
  }
}

/**
 * List all available indexes
 */
export function listIndexes(): IndexDefinition[] {
  const results: IndexDefinition[] = [];
  
  try {
    // Check each index type directory
    for (const type of Object.values(IndexType)) {
      const dir = path.join(INDEX_BASE_DIR, type.toString());
      if (!fs.existsSync(dir)) continue;
      
      // Read all index files
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.idx'));
      for (const file of files) {
        try {
          const indexPath = path.join(dir, file);
          const content = fs.readFileSync(indexPath, 'utf8');
          const indexSet = JSON.parse(content) as IndexSet;
          
          // Add definition to results
          results.push(indexSet.definition);
        } catch (readError) {
          console.error(`Error reading index file ${file}:`, readError);
        }
      }
    }
  } catch (error) {
    console.error('Error listing indexes:', error);
  }
  
  return results;
}

/**
 * Get statistics for all indexes
 */
export function getIndexStats(): IndexStats[] {
  return Array.from(indexStats.values());
}

/**
 * Record a successful index lookup for statistics
 */
export function recordIndexLookup(indexId: string, lookupTime: number): void {
  let stats = indexStats.get(indexId);
  
  // Create stats object if it doesn't exist
  if (!stats) {
    stats = {
      id: indexId,
      hits: 0,
      totalLookupTime: 0,
      avgLookupTime: 0,
      lastUsed: 0
    };
    indexStats.set(indexId, stats);
  }
  
  // Update stats
  stats.hits++;
  stats.totalLookupTime += lookupTime;
  stats.avgLookupTime = stats.totalLookupTime / stats.hits;
  stats.lastUsed = Date.now();
}

/**
 * Find the best available index for a given query condition
 */
export function findBestIndex(
  entityType: string,
  field: string,
  operator: string,
  attachedType?: string
): IndexDefinition | null {
  const allIndexes = listIndexes();
  
  // Filter indexes that match entity type and field
  const matchingIndexes = allIndexes.filter(idx => {
    if (idx.entityType !== entityType) return false;
    
    // For attached docs, ensure attachedType matches
    if (idx.target === IndexTarget.ATTACHED && idx.attachedType !== attachedType) {
      return false;
    }
    
    // Check if field matches
    return idx.field === field;
  });
  
  if (matchingIndexes.length === 0) {
    return null;
  }
  
  // Find the best index based on the operator
  switch (operator) {
    case 'eq':
      return matchingIndexes.find(idx => idx.type === IndexType.HASH) || 
             matchingIndexes.find(idx => idx.type === IndexType.RANGE) ||
             matchingIndexes[0];
    
    case 'gt':
    case 'lt':
      return matchingIndexes.find(idx => idx.type === IndexType.RANGE) ||
             matchingIndexes[0];
    
    case 'contains':
      return matchingIndexes.find(idx => idx.type === IndexType.TEXT) ||
             matchingIndexes[0];
    
    case 'in':
      return matchingIndexes.find(idx => idx.type === IndexType.ARRAY) ||
             matchingIndexes[0];
    
    default:
      return matchingIndexes[0];
  }
}