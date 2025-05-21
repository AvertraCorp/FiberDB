/**
 * Asynchronous Query Engine with Parallel Processing
 */
import path from "path";
import config from "../../config";
import { performanceTracker } from "../../utils/performance";
import { 
  documentCache, 
  queryCache, 
  getCacheKey,
} from "../../utils/cache";
import { loadJSONAsync, existsAsync, readdirAsync } from "../storage";
import { decryptFields, matchCondition } from "./utils";
import { useIndexForQuery } from "../indexing";
import type { QueryOptions } from "../../types";

const ttlDays = config.storage.ttlDays;
const ttlCutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

/**
 * Process a single anchor entity asynchronously
 */
async function processAnchorEntity(
  anchorPath: string,
  file: string,
  query: QueryOptions
): Promise<any | null> {
  const filePath = path.join(anchorPath, file);
  performanceTracker.startPhase(`loadFileAsync:${file}`);
  
  // Load the base anchor document
  const baseRaw = await loadJSONAsync(filePath);
  performanceTracker.endPhase(`loadFileAsync:${file}`);
  
  if (!baseRaw) return null;
  
  // TTL filtering
  performanceTracker.startPhase("ttlFiltering");
  const baseDate = new Date(baseRaw.created_at || baseRaw.createdAt || Date.now());
  if (baseDate < ttlCutoff) {
    performanceTracker.endPhase("ttlFiltering");
    return null;
  }
  performanceTracker.endPhase("ttlFiltering");
  
  // Decrypt fields if necessary
  performanceTracker.startPhase("decryption");
  const base = decryptFields(baseRaw, query.decryptionKey);
  performanceTracker.endPhase("decryption");
  
  // Apply primary filtering
  performanceTracker.startPhase("primaryFiltering");
  if (query.filter && !matchCondition(base, query.filter)) {
    performanceTracker.endPhase("primaryFiltering");
    return null;
  }
  performanceTracker.endPhase("primaryFiltering");
  
  // Prepare the basic result
  performanceTracker.startPhase("prepareResult");
  const entry: Record<string, any> = { id: base.id };
  if (!query.include || query.include.includes("*")) Object.assign(entry, base);
  else query.include.forEach((f: string) => { if (!f.includes(".")) entry[f] = base[f]; });
  performanceTracker.endPhase("prepareResult");
  
  // Handle attached collections
  performanceTracker.startPhase("processAttachments");
  const attachedPath = path.join(config.storage.baseDir, "attached", base.id);
  
  // Check if the attached directory exists
  if (await existsAsync(attachedPath)) {
    // Get list of attachment files
    const attachmentFiles = await readdirAsync(attachedPath);
    const attachmentPromises = [];
    
    // Create promises for loading each attachment
    for (const attachmentFile of attachmentFiles) {
      const key = attachmentFile.replace(".json", "");
      
      // Skip if not included in the query
      if (query.include && !query.include.includes("*") && !query.include.includes(key)) {
        continue;
      }
      
      // Create a promise to process this attachment
      const attachmentPromise = (async () => {
        performanceTracker.startPhase(`attachment:${attachmentFile}`);
        
        // Load the attachment data
        const attachmentPath = path.join(attachedPath, attachmentFile);
        const docs = await loadJSONAsync(attachmentPath) || [];
        
        // Decrypt if needed
        performanceTracker.startPhase("decryptAttachments");
        const decryptedDocs = docs.map((d: any) => decryptFields(d, query.decryptionKey));
        performanceTracker.endPhase("decryptAttachments");
        
        // Apply filters to attached documents
        let filteredDocs = decryptedDocs;
        
        // Process where conditions for attached documents
        if (query.where) {
          performanceTracker.startPhase("filterAttachments");
          
          const keyPrefix = key + '.';
          const relevantConditions: Record<string, any> = {};
          
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
        
        // Add the filtered documents to the entry
        entry[key] = filteredDocs;
        
        performanceTracker.endPhase(`attachment:${attachmentFile}`);
      })();
      
      attachmentPromises.push(attachmentPromise);
    }
    
    // Wait for all attachment loading to complete in parallel
    await Promise.all(attachmentPromises);
  }
  
  performanceTracker.endPhase("processAttachments");
  
  return entry;
}

/**
 * Run a structured query with parallel processing
 */
export async function runStructuredQueryAsync(query: QueryOptions) {
  // Start performance tracking
  performanceTracker.start(`AsyncQuery ${query.primary}${query.id ? ' [id:' + query.id + ']' : ''}`);
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
    });
    
    // Check if this query result is in the cache
    const cachedResult = queryCache.get(queryCacheKey);
    if (cachedResult) {
      performanceTracker.addDetail("queryCacheHit", true);
      performanceTracker.endPhase("cacheCheck");
      
      // If metrics are requested, we still need to finish the tracking
      if (query.includePerformanceMetrics) {
        const metrics = performanceTracker.end();
        
        // Clone the cached result to avoid modifying the cached version
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
      
      // Return a clone of the cached result to avoid modifications
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
  
  // Begin processing files in the anchor directory
  const anchorPath = path.join(config.storage.baseDir, "anchors", query.primary);
  let results: any[] = [];
  
  // Get list of files to process
  performanceTracker.startPhase("findFiles");
  let files: string[];
  
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
      files = query.id ? [`${query.id}.json`] : await readdirAsync(anchorPath);
      performanceTracker.addDetail("filesCount", files.length);
    } catch (error) {
      console.error("Error reading directory:", error);
      files = [];
      performanceTracker.addDetail("error", "Failed to read directory");
    }
  }
  performanceTracker.endPhase("findFiles");
  
  // Process all files in parallel
  performanceTracker.startPhase("processFiles");
  
  // Create promises for each file
  const filePromises = files.map(file => processAnchorEntity(anchorPath, file, query));
  
  // Wait for all file processing to complete in parallel
  const processedEntries = await Promise.all(filePromises);
  
  // Filter out null results and add non-null entries to the results
  results = processedEntries.filter(entry => entry !== null);
  
  performanceTracker.addDetail("recordsStats", {
    processed: files.length,
    returned: results.length
  });
  
  performanceTracker.endPhase("processFiles");
  
  // Cache the query results
  if (!query.skipCache) {
    const queryCacheKey = getCacheKey({
      primary: query.primary,
      id: query.id,
      filter: query.filter,
      where: query.where,
      include: query.include,
    });
    
    // Cache a deep clone of the results to prevent modification
    queryCache.set(queryCacheKey, JSON.parse(JSON.stringify(results)));
    performanceTracker.addDetail("cachedQueryResult", true);
  }
  
  // Complete performance tracking
  const metrics = performanceTracker.end();
  
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