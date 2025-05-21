// index-integration.ts - Integration with the FiberDB query engine
import { performanceTracker } from '../utils/performance';
import { findAndQueryIndex } from './index-query';
import { IndexCondition } from './index-types';

/**
 * Convert a query filter condition to an index condition
 */
function convertToIndexCondition(condition: any): IndexCondition | null {
  // Handle basic equality (direct value)
  if (typeof condition !== 'object' || condition === null) {
    return {
      value: condition,
      operator: 'eq'
    };
  }

  // Handle operator conditions
  const operators = Object.keys(condition);
  if (operators.length === 0) return null;
  
  const operator = operators[0];
  if (!['eq', 'ne', 'gt', 'lt', 'contains', 'in'].includes(operator)) {
    return null;
  }
  
  return {
    value: condition[operator],
    operator: operator as any
  };
}

/**
 * Use indexes for filtering if available
 * Returns a list of matched IDs or null if no index was used
 */
export function useIndexForQuery(
  entityType: string,
  conditions: Record<string, any>
): string[] | null {
  performanceTracker.start('UseIndexForQuery');
  performanceTracker.addDetail("entityType", entityType);
  performanceTracker.addDetail("conditionCount", Object.keys(conditions).length);
  
  try {
    let matchedIds: string[] | null = null;
    
    // Process each condition and try to use indexes
    for (const [fieldPath, condition] of Object.entries(conditions)) {
      // Parse field path to determine if it's for attached docs
      const [first, ...rest] = fieldPath.split('.');
      
      // Skip conditions that can't be handled by indexes
      const indexCondition = convertToIndexCondition(condition);
      if (!indexCondition) continue;
      
      // For attached documents
      if (rest.length > 0) {
        const attachedType = first;
        const attachedField = rest.join('.');
        
        // Try to find and query an index for this attached field
        const result = findAndQueryIndex(
          entityType,
          attachedField,
          indexCondition,
          attachedType
        );
        
        if (result) {
          // If this is the first condition, use its results directly
          if (matchedIds === null) {
            matchedIds = result.matchedIds;
          } else {
            // Intersect with previous results (AND logic)
            matchedIds = matchedIds.filter(id => result.matchedIds.includes(id));
          }
          
          performanceTracker.addDetail("usedIndex", {
            id: result.indexUsed,
            type: result.indexType,
            matches: result.matchedIds.length,
            time: result.lookupTime
          });
        }
      } 
      // For primary entity fields
      else {
        // Try to find and query an index for this primary field
        const result = findAndQueryIndex(
          entityType,
          fieldPath,
          indexCondition
        );
        
        if (result) {
          // If this is the first condition, use its results directly
          if (matchedIds === null) {
            matchedIds = result.matchedIds;
          } else {
            // Intersect with previous results (AND logic)
            matchedIds = matchedIds.filter(id => result.matchedIds.includes(id));
          }
          
          performanceTracker.addDetail("usedIndex", {
            id: result.indexUsed,
            type: result.indexType,
            matches: result.matchedIds.length,
            time: result.lookupTime
          });
        }
      }
      
      // If we've filtered down to zero results, we can stop early
      if (matchedIds && matchedIds.length === 0) {
        break;
      }
    }
    
    performanceTracker.addDetail("indexesUsed", matchedIds !== null);
    performanceTracker.addDetail("resultCount", matchedIds?.length ?? 0);
    
    const metrics = performanceTracker.end();
    return matchedIds;
  } catch (error) {
    console.error('Error using index for query:', error);
    performanceTracker.end();
    return null;
  }
}

/**
 * Convert an ID-only result to include file paths for processing
 */
export function idsToFilePaths(entityType: string, ids: string[]): string[] {
  // For anchor entities, convert IDs to file paths
  return ids.map(id => `data/anchors/${entityType}/${id}.json`);
}

/**
 * Parse an attached entity ID (in the format entityId:index)
 */
export function parseAttachedEntityId(id: string): { entityId: string, index: number } | null {
  const parts = id.split(':');
  if (parts.length < 2) return null;
  
  const indexStr = parts[parts.length - 1];
  const entityId = parts.slice(0, -1).join(':');
  
  const index = parseInt(indexStr, 10);
  if (isNaN(index)) return null;
  
  return { entityId, index };
}