// index-query.ts - Functions for querying indexes
import { performanceTracker } from '../utils/performance';
import { 
  IndexDefinition, 
  IndexType, 
  IndexTarget,
  IndexSet,
  IndexEntry,
  IndexQueryResult,
  IndexCondition
} from './index-types';
import { 
  loadIndex, 
  recordIndexLookup,
  findBestIndex
} from './index-manager';

/**
 * Perform a hash index lookup (equality)
 */
function hashIndexLookup(indexSet: IndexSet, value: any): string[] {
  const entry = indexSet.entries.find(e => e.value === value);
  return entry ? [...entry.entities] : [];
}

/**
 * Perform a range index lookup (gt, lt, gte, lte)
 */
function rangeIndexLookup(indexSet: IndexSet, condition: IndexCondition): string[] {
  // Sort entries by value for range operations
  const sortedEntries = [...indexSet.entries].sort((a, b) => {
    if (typeof a.value === 'number' && typeof b.value === 'number') {
      return a.value - b.value;
    }
    return String(a.value).localeCompare(String(b.value));
  });
  
  let matchingEntities: string[] = [];
  
  switch (condition.operator) {
    case 'eq':
      const exactEntry = sortedEntries.find(e => e.value === condition.value);
      if (exactEntry) {
        matchingEntities.push(...exactEntry.entities);
      }
      break;
      
    case 'gt':
      for (const entry of sortedEntries) {
        if (entry.value > condition.value) {
          matchingEntities.push(...entry.entities);
        }
      }
      break;
      
    case 'lt':
      for (const entry of sortedEntries) {
        if (entry.value < condition.value) {
          matchingEntities.push(...entry.entities);
        }
      }
      break;
      
    case 'ne':
      for (const entry of sortedEntries) {
        if (entry.value !== condition.value) {
          matchingEntities.push(...entry.entities);
        }
      }
      break;
      
    default:
      // Unsupported operator for range index
      break;
  }
  
  return matchingEntities;
}

/**
 * Perform a text index lookup (contains)
 */
function textIndexLookup(indexSet: IndexSet, text: string): string[] {
  // Determine case sensitivity
  const isCaseSensitive = indexSet.definition.isCaseSensitive ?? false;
  const searchText = isCaseSensitive ? text : text.toLowerCase();
  
  let matchingEntities: string[] = [];
  
  for (const entry of indexSet.entries) {
    const entryValue = String(entry.value);
    const valueToCheck = isCaseSensitive ? entryValue : entryValue.toLowerCase();
    
    if (valueToCheck.includes(searchText)) {
      matchingEntities.push(...entry.entities);
    }
  }
  
  return matchingEntities;
}

/**
 * Perform an array index lookup (in)
 */
function arrayIndexLookup(indexSet: IndexSet, values: any[]): string[] {
  if (!Array.isArray(values)) {
    values = [values]; // Convert single value to array for in operator
  }
  
  let matchingEntities: string[] = [];
  
  for (const entry of indexSet.entries) {
    if (values.includes(entry.value)) {
      matchingEntities.push(...entry.entities);
    }
  }
  
  return matchingEntities;
}

/**
 * Query an index with a condition
 */
export function queryIndex(
  indexId: string, 
  condition: IndexCondition
): IndexQueryResult {
  performanceTracker.start(`QueryIndex ${indexId}`);
  performanceTracker.addDetail("condition", condition);
  
  try {
    // Load the index
    const indexSet = loadIndex(indexId);
    if (!indexSet) {
      throw new Error(`Index ${indexId} not found`);
    }
    
    // Track index statistics
    const startTime = performance.now();
    
    // Execute the appropriate lookup based on index type
    let matchedIds: string[] = [];
    
    switch (indexSet.definition.type) {
      case IndexType.HASH:
        if (condition.operator === 'eq') {
          matchedIds = hashIndexLookup(indexSet, condition.value);
        } else {
          // Fallback for operators not optimized for hash indexes
          performanceTracker.addDetail("warning", "Suboptimal operator for hash index");
          switch (condition.operator) {
            case 'ne':
              const exactMatches = hashIndexLookup(indexSet, condition.value);
              const allIds = indexSet.entries.flatMap(e => e.entities);
              matchedIds = allIds.filter(id => !exactMatches.includes(id));
              break;
            case 'in':
              if (Array.isArray(condition.value)) {
                matchedIds = condition.value.flatMap(v => hashIndexLookup(indexSet, v));
              }
              break;
            default:
              performanceTracker.addDetail("error", `Unsupported operator ${condition.operator} for hash index`);
          }
        }
        break;
        
      case IndexType.RANGE:
        matchedIds = rangeIndexLookup(indexSet, condition);
        break;
        
      case IndexType.TEXT:
        if (condition.operator === 'contains' && typeof condition.value === 'string') {
          matchedIds = textIndexLookup(indexSet, condition.value);
        } else {
          performanceTracker.addDetail("error", `Unsupported operator ${condition.operator} for text index`);
        }
        break;
        
      case IndexType.ARRAY:
        if (condition.operator === 'in') {
          matchedIds = arrayIndexLookup(indexSet, condition.value);
        } else {
          performanceTracker.addDetail("error", `Unsupported operator ${condition.operator} for array index`);
        }
        break;
        
      default:
        performanceTracker.addDetail("error", `Unknown index type: ${indexSet.definition.type}`);
    }
    
    // Remove duplicates from results
    matchedIds = [...new Set(matchedIds)];
    
    // Record lookup time
    const endTime = performance.now();
    const lookupTime = endTime - startTime;
    recordIndexLookup(indexId, lookupTime);
    
    // Prepare result
    const result: IndexQueryResult = {
      matchedIds,
      lookupTime,
      indexUsed: indexId,
      indexType: indexSet.definition.type
    };
    
    performanceTracker.addDetail("matchCount", matchedIds.length);
    performanceTracker.addDetail("lookupTime", lookupTime);
    
    const metrics = performanceTracker.end();
    return result;
  } catch (error) {
    console.error(`Error querying index ${indexId}:`, error);
    performanceTracker.end();
    
    // Return empty result on error
    return {
      matchedIds: [],
      lookupTime: 0,
      indexUsed: indexId,
      indexType: IndexType.HASH // Default
    };
  }
}

/**
 * Find the best index for a query condition and use it
 */
export function findAndQueryIndex(
  entityType: string,
  field: string,
  condition: IndexCondition,
  attachedType?: string
): IndexQueryResult | null {
  // Find the best index for this query
  const bestIndex = findBestIndex(
    entityType,
    field,
    condition.operator,
    attachedType
  );
  
  if (!bestIndex) {
    return null; // No suitable index found
  }
  
  // Query the index
  return queryIndex(bestIndex.id, condition);
}