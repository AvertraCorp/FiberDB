/**
 * Synchronous Query Engine
 */
import fs from "fs";
import path from "path";
import config from "../../config";
import { performanceTracker } from "../../utils/performance";
import { 
  documentCache, 
  queryCache, 
  fileExistsCache, 
  getCacheKey 
} from "../../utils/cache";
import { loadJSON } from "../storage";
import { decryptFields, matchCondition } from "./utils";
import { useIndexForQuery } from "../indexing";
import type { QueryOptions } from "../../types";

const ttlDays = config.storage.ttlDays;
const ttlCutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

/**
 * Run a structured query using synchronous processing
 */
export function runStructuredQuery(query: QueryOptions) {
  // Start performance tracking
  performanceTracker.start(`Query ${query.primary}${query.id ? ' [id:' + query.id + ']' : ''}`);
  performanceTracker.addDetail("queryParams", {
    primary: query.primary,
    hasId: !!query.id,
    hasFilter: !!query.filter,
    hasWhere: !!query.where,
    includeFields: query.include || "*",
    useIndexes: query.useIndexes ?? true
  });
  
  // Check if we can use the cache for this query
  if (!query.skipCache) {
    performanceTracker.startPhase("cacheCheck");
    
    // Generate a cache key for this query
    const queryCacheKey = getCacheKey({
      primary: query.primary,
      id: query.id,
      filter: query.filter,
      where: query.where,
      include: query.include,
      // We don't include decryptionKey in the cache key as it affects content but not structure
    });
    
    // Check if this query result is in the cache
    const cachedResult = queryCache.get(queryCacheKey);
    if (cachedResult) {
      performanceTracker.addDetail("queryCacheHit", true);
      performanceTracker.endPhase("cacheCheck");
      
      // If we need to include metrics, we still need to finish the performance tracking
      if (query.includePerformanceMetrics) {
        const metrics = performanceTracker.end();
        
        // Clone the cached result to avoid modifying the cached object
        const result = JSON.parse(JSON.stringify(cachedResult));
        
        // Add metrics to the first result if available
        if (result.length > 0) {
          result[0].__metrics = metrics;
        } else if (result.length === 0) {
          result.push({ __metrics: metrics });
        }
        
        if (query.includePerformanceMetrics) {
          console.log(performanceTracker.formatMetrics(metrics));
        }
        
        return result;
      }
      
      // Return a clone of the cached result to avoid unexpected modifications
      return JSON.parse(JSON.stringify(cachedResult));
    }
    
    performanceTracker.addDetail("queryCacheHit", false);
    performanceTracker.endPhase("cacheCheck");
  }
  
  // Check if we can use indexes for this query
  let indexMatchedIds: string[] | null = null;
  
  if (query.useIndexes !== false) {
    performanceTracker.startPhase("indexCheck");
    
    // Try to use indexes for filtering if available
    // Only use indexes when we don't have a specific ID
    if (!query.id) {
      // Try with primary filters first
      if (query.filter) {
        indexMatchedIds = useIndexForQuery(query.primary, query.filter);
        performanceTracker.addDetail("usedPrimaryIndexes", indexMatchedIds !== null);
      }
      
      // If we have attachment filters and no primary index match, try those
      // Or if both primary and attachment filters are used, we need to combine the results
      if (query.where && (!indexMatchedIds || query.filter)) {
        const attachmentMatches = useIndexForQuery(query.primary, query.where);
        
        if (attachmentMatches) {
          if (indexMatchedIds) {
            // Intersect with primary filter results
            indexMatchedIds = indexMatchedIds.filter(id => 
              attachmentMatches.includes(id)
            );
          } else {
            indexMatchedIds = attachmentMatches;
          }
          
          performanceTracker.addDetail("usedAttachmentIndexes", true);
        }
      }
    }
    
    performanceTracker.endPhase("indexCheck");
  }
  
  const anchorPath = path.join(config.storage.baseDir, "anchors", query.primary);
  const results: any[] = [];

  // Get list of files to process
  performanceTracker.startPhase("findFiles");
  let files;
  
  // If we've already found matches using indexes, use those
  if (indexMatchedIds && indexMatchedIds.length > 0) {
    performanceTracker.addDetail("usingIndexResults", true);
    
    files = indexMatchedIds.map(id => {
      // If it already has .json extension, use as is
      if (id.endsWith('.json')) {
        return id;
      }
      return `${id}.json`;
    });
  }
  // Otherwise use the standard path
  else {
    try {
      files = query.id ? [`${query.id}.json`] : fs.readdirSync(anchorPath);
      performanceTracker.addDetail("filesCount", files.length);
    } catch (error) {
      console.error("Error reading directory:", error);
      files = [];
      performanceTracker.addDetail("error", "Failed to read directory");
    }
  }
  performanceTracker.endPhase("findFiles");

  performanceTracker.startPhase("processFiles");
  let processedCount = 0;
  let filteredCount = 0;
  
  for (const file of files) {
    const filePath = path.join(anchorPath, file);
    performanceTracker.startPhase(`loadFile:${file}`);
    
    const baseRaw = loadJSON(filePath);
    performanceTracker.endPhase(`loadFile:${file}`);
    
    if (!baseRaw) continue;
    processedCount++;

    // TTL filtering
    performanceTracker.startPhase("ttlFiltering");
    const baseDate = new Date(baseRaw.created_at || baseRaw.createdAt || Date.now());
    const skippedDueToTTL = baseDate < ttlCutoff;
    performanceTracker.endPhase("ttlFiltering");
    
    if (skippedDueToTTL) {
      filteredCount++;
      continue;
    }

    performanceTracker.startPhase("decryption");
    const base = decryptFields(baseRaw, query.decryptionKey);
    performanceTracker.endPhase("decryption");

    // Primary filtering
    performanceTracker.startPhase("primaryFiltering");
    const skipDueToFilter = query.filter && !matchCondition(base, query.filter);
    performanceTracker.endPhase("primaryFiltering");
    
    if (skipDueToFilter) {
      filteredCount++;
      continue;
    }

    performanceTracker.startPhase("prepareResult");
    const entry: Record<string, any> = { id: base.id };
    if (!query.include || query.include.includes("*")) Object.assign(entry, base);
    else query.include.forEach(f => { if (!f.includes(".")) entry[f] = base[f]; });
    performanceTracker.endPhase("prepareResult");

    // Handle attached collections
    const attachedPath = path.join(config.storage.baseDir, "attached", base.id);
    
    performanceTracker.startPhase("processAttachments");
    let attachmentsProcessed = 0;
    
    if (fs.existsSync(attachedPath)) {
      const attachmentFiles = fs.readdirSync(attachedPath);
      
      for (const attachmentFile of attachmentFiles) {
        performanceTracker.startPhase(`attachment:${attachmentFile}`);
        const key = attachmentFile.replace(".json", "");
        attachmentsProcessed++;
        
        if (query.include && !query.include.includes("*") && !query.include.includes(key)) {
          performanceTracker.endPhase(`attachment:${attachmentFile}`);
          continue;
        }

        const docs = loadJSON(path.join(attachedPath, attachmentFile)) || [];
        const docsCount = docs.length;
        
        performanceTracker.startPhase("decryptAttachments");
        const decryptedDocs = docs.map((d: any) => decryptFields(d, query.decryptionKey));
        performanceTracker.endPhase("decryptAttachments");

        // Apply filters to documents if needed
        let filteredDocs = decryptedDocs;
        
        // Process where conditions for attached documents
        if (query.where) {
          performanceTracker.startPhase("filterAttachments");
          
          const keyPrefix = key + '.';
          const relevantConditions = {};
          
          // Extract conditions relevant to this attachment
          for (const [path, condition] of Object.entries(query.where)) {
            if (path.startsWith(keyPrefix)) {
              const fieldName = path.substring(keyPrefix.length);
              relevantConditions[fieldName] = condition;
            }
          }
          
          // Apply the conditions
          if (Object.keys(relevantConditions).length > 0) {
            // Filter documents based on the relevant conditions
            filteredDocs = decryptedDocs.filter(doc => matchCondition(doc, relevantConditions));
            performanceTracker.addDetail(`${key}Filtered`, {
              before: decryptedDocs.length,
              after: filteredDocs.length
            });
          }
          
          performanceTracker.endPhase("filterAttachments");
        }
        
        entry[key] = filteredDocs;
        performanceTracker.endPhase(`attachment:${attachmentFile}`);
      }
    }
    
    performanceTracker.addDetail("attachmentsProcessed", attachmentsProcessed);
    performanceTracker.endPhase("processAttachments");
    
    results.push(entry);
  }
  
  performanceTracker.addDetail("recordsStats", {
    processed: processedCount,
    filtered: filteredCount,
    returned: results.length
  });
  
  performanceTracker.endPhase("processFiles");
  
  // Complete performance tracking
  const metrics = performanceTracker.end();
  
  // Cache the query results before we add any metrics (which aren't part of the actual data)
  if (!query.skipCache) {
    const queryCacheKey = getCacheKey({
      primary: query.primary,
      id: query.id,
      filter: query.filter,
      where: query.where,
      include: query.include,
    });
    
    // Cache a deep clone of the results to prevent modification of cached data
    queryCache.set(queryCacheKey, JSON.parse(JSON.stringify(results)));
    performanceTracker.addDetail("cachedQueryResult", true);
  }
  
  // Add performance metrics if requested
  if (query.includePerformanceMetrics) {
    const firstResult = results[0];
    if (firstResult) {
      firstResult.__metrics = metrics;
    } else if (results.length === 0) {
      // Create a placeholder result just for metrics
      results.push({ __metrics: metrics });
    }
    console.log(performanceTracker.formatMetrics(metrics));
  }
  
  return results;
}