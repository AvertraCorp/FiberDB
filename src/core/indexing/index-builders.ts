// index-builders.ts - Logic for building different index types
import fs from 'fs';
import path from 'path';
import { performanceTracker } from '../utils/performance';
import { 
  IndexDefinition, 
  IndexType, 
  IndexTarget,
  IndexSet,
  IndexEntry
} from './index-types';
import { 
  createIndex, 
  loadIndex, 
  saveIndex,
  updateIndex
} from './index-manager';

/**
 * Extract a value from an object using a field path with dot notation
 */
function extractValue(obj: any, fieldPath: string): any {
  const parts = fieldPath.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Build an index for anchor entities
 */
export async function buildAnchorIndex(definition: IndexDefinition): Promise<boolean> {
  performanceTracker.start(`BuildAnchorIndex ${definition.id}`);
  performanceTracker.addDetail("indexDefinition", definition);
  
  try {
    // Create the index structure
    await createIndex(definition);
    
    // Path to anchor data
    const anchorPath = path.join('data/anchors', definition.entityType);
    if (!fs.existsSync(anchorPath)) {
      throw new Error(`Entity type directory not found: ${anchorPath}`);
    }
    
    // Get list of entity files
    performanceTracker.startPhase("findFiles");
    const files = fs.readdirSync(anchorPath).filter(f => f.endsWith('.json'));
    performanceTracker.addDetail("fileCount", files.length);
    performanceTracker.endPhase("findFiles");
    
    // Process each entity file
    performanceTracker.startPhase("processFiles");
    let indexedCount = 0;
    
    for (const file of files) {
      try {
        // Load the entity data
        const filePath = path.join(anchorPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const entity = JSON.parse(content);
        
        // Extract the field value to index
        const value = extractValue(entity, definition.field);
        
        // Skip if value is null/undefined and we're ignoring nulls
        if ((value === null || value === undefined) && definition.ignoreNull) {
          continue;
        }
        
        // For text indexes, apply case sensitivity options
        let indexValue = value;
        if (definition.type === IndexType.TEXT && !definition.isCaseSensitive && typeof value === 'string') {
          indexValue = value.toLowerCase();
        }
        
        // Add to index
        const entityId = entity.id || path.basename(file, '.json');
        updateIndex(definition.id, indexValue, entityId);
        indexedCount++;
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
      }
    }
    
    performanceTracker.addDetail("indexedCount", indexedCount);
    performanceTracker.endPhase("processFiles");
    
    const metrics = performanceTracker.end();
    return true;
  } catch (error) {
    console.error(`Error building anchor index ${definition.id}:`, error);
    performanceTracker.end();
    return false;
  }
}

/**
 * Build an index for attached documents
 */
export async function buildAttachedIndex(definition: IndexDefinition): Promise<boolean> {
  if (!definition.attachedType) {
    throw new Error('attachedType is required for attached document indexes');
  }
  
  performanceTracker.start(`BuildAttachedIndex ${definition.id}`);
  performanceTracker.addDetail("indexDefinition", definition);
  
  try {
    // Create the index structure
    await createIndex(definition);
    
    // Path to attached data
    const attachedBasePath = path.join('data/attached');
    if (!fs.existsSync(attachedBasePath)) {
      throw new Error(`Attached data directory not found: ${attachedBasePath}`);
    }
    
    // Get list of entity directories
    performanceTracker.startPhase("findDirectories");
    const entityDirs = fs.readdirSync(attachedBasePath);
    performanceTracker.addDetail("entityDirCount", entityDirs.length);
    performanceTracker.endPhase("findDirectories");
    
    // Process each entity directory
    performanceTracker.startPhase("processEntities");
    let indexedCount = 0;
    
    for (const entityDir of entityDirs) {
      try {
        const attachedPath = path.join(attachedBasePath, entityDir);
        if (!fs.statSync(attachedPath).isDirectory()) {
          continue;
        }
        
        // Look for the specific attached document type
        const attachedFilePath = path.join(attachedPath, `${definition.attachedType}.json`);
        if (!fs.existsSync(attachedFilePath)) {
          continue;
        }
        
        // Load the attached documents
        const content = fs.readFileSync(attachedFilePath, 'utf8');
        const attachedDocs = JSON.parse(content);
        
        if (!Array.isArray(attachedDocs)) {
          console.warn(`Attached document is not an array: ${attachedFilePath}`);
          continue;
        }
        
        // Process each attached document
        for (let i = 0; i < attachedDocs.length; i++) {
          const doc = attachedDocs[i];
          
          // Extract the field value
          const value = extractValue(doc, definition.field);
          
          // Skip if value is null/undefined and we're ignoring nulls
          if ((value === null || value === undefined) && definition.ignoreNull) {
            continue;
          }
          
          // For text indexes, apply case sensitivity options
          let indexValue = value;
          if (definition.type === IndexType.TEXT && !definition.isCaseSensitive && typeof value === 'string') {
            indexValue = value.toLowerCase();
          }
          
          // Add to index - use entityId:index as the entity ID to identify specific attached docs
          const entityId = `${entityDir}:${i}`;
          updateIndex(definition.id, indexValue, entityId);
          indexedCount++;
        }
      } catch (entityError) {
        console.error(`Error processing entity ${entityDir}:`, entityError);
      }
    }
    
    performanceTracker.addDetail("indexedCount", indexedCount);
    performanceTracker.endPhase("processEntities");
    
    const metrics = performanceTracker.end();
    return true;
  } catch (error) {
    console.error(`Error building attached index ${definition.id}:`, error);
    performanceTracker.end();
    return false;
  }
}

/**
 * Build an index based on its definition
 */
export async function buildIndex(definition: IndexDefinition): Promise<boolean> {
  // Validate index definition
  if (!definition.id || !definition.name || !definition.type || !definition.target || !definition.field) {
    throw new Error('Invalid index definition - missing required fields');
  }
  
  // Check if attached type is provided for attached indexes
  if (definition.target === IndexTarget.ATTACHED && !definition.attachedType) {
    throw new Error('attachedType is required for attached document indexes');
  }
  
  // Build the appropriate index based on target type
  if (definition.target === IndexTarget.ANCHOR) {
    return buildAnchorIndex(definition);
  } else if (definition.target === IndexTarget.ATTACHED) {
    return buildAttachedIndex(definition);
  } else {
    throw new Error(`Unknown index target: ${definition.target}`);
  }
}

/**
 * Rebuild an existing index
 */
export async function rebuildIndex(indexId: string): Promise<boolean> {
  // Load the index definition
  const indexSet = loadIndex(indexId);
  if (!indexSet) {
    throw new Error(`Index ${indexId} not found`);
  }
  
  // Delete the index
  const indexPath = path.join('data/indexes', indexSet.definition.type.toString(), `${indexId}.idx`);
  if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
  }
  
  // Rebuild the index
  return buildIndex(indexSet.definition);
}