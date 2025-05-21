/**
 * Asynchronous Query Engine with Parallel Processing
 */
import fs from "fs";
import path from "path";
import config from "../../config";
import { performanceTracker } from "../../utils/performance";
import { 
  documentCache, 
  queryCache, 
  fileExistsCache,
  getCacheKey,
  getDocumentCacheKey,
  getAttachedCacheKey
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
  // First check document cache for this entity
  const entityId = file.replace('.json', '');
  const cacheKey = getDocumentCacheKey(query.primary, entityId);
  
  let baseRaw;
  if (!query.skipCache) {
    baseRaw = documentCache.get(cacheKey);
    if (baseRaw) {
      // If found in cache, increment cache hits counter
      const cacheHits = (performanceTracker.details?.cacheHits || 0) + 1;
      performanceTracker.addDetail("cacheHits", cacheHits);
    }
  }
  
  // If not in cache or cache skipped, load from file
  if (baseRaw === undefined) {
    const filePath = path.join(anchorPath, file);
    const startTime = performance.now();
    
    // Load the base anchor document
    try {
      baseRaw = await loadJSONAsync(filePath);
      const duration = performance.now() - startTime;
      
      // Only track individual file timings in debug mode to reduce overhead
      if (query.includePerformanceMetrics) {
        performanceTracker.addPhase(`loadFileAsync:${file}`, duration);
      }
      
      // Cache the loaded document if valid
      if (baseRaw && !query.skipCache) {
        documentCache.set(cacheKey, baseRaw);
      }
    } catch (error) {
      // Log error but continue with other files
      console.error(`Error loading file ${file}:`, error);
      return null;
    }
  }
  
  // Skip further processing if document couldn't be loaded
  if (!baseRaw) return null;
  
  // Quick TTL check - unless override provided
  if (!query.skipTTL) {
    const baseDate = new Date(baseRaw.created_at || baseRaw.createdAt || Date.now());
    if (baseDate < ttlCutoff) {
      return null;  // Skip TTL tracking to reduce overhead on filtered items
    }
  }
  
  // Apply primary filtering early for fast rejection
  if (query.filter) {
    // Pre-decrypt if using secure fields in filter
    let filteredBase = query.decryptionKey && baseRaw.__secure ? 
      decryptFields(baseRaw, query.decryptionKey) : baseRaw;
      
    if (!matchCondition(filteredBase, query.filter)) {
      return null; // Skip further processing if filter doesn't match
    }
  }
  
  // Decrypt fields if necessary (and not already done)
  const base = query.decryptionKey && baseRaw.__secure ? 
    decryptFields(baseRaw, query.decryptionKey) : baseRaw;
  
  // Prepare the basic result with just the required fields
  const entry: Record<string, any> = { id: base.id };
  
  if (!query.include || query.include.includes("*")) {
    // Include all fields
    Object.assign(entry, base);
  } else {
    // Only include specified fields
    query.include.forEach((f: string) => { 
      if (!f.includes(".")) entry[f] = base[f];
    });
  }
  
  // Only process attachments if needed
  const needsAttachments = !query.include || 
    query.include.includes("*") || 
    query.include.some(f => f.includes("."));
    
  if (needsAttachments) {
    const attachedPath = path.join(config.storage.baseDir, "attached", base.id);
    
    // Check if the attached directory exists
    if (await existsAsync(attachedPath)) {
      // Get list of attachment files
      const attachmentFiles = await readdirAsync(attachedPath);
      
      // Filter to only required attachments to reduce processing
      const includedAttachments = query.include && !query.include.includes("*") ?
        attachmentFiles.filter(file => {
          const key = file.replace(".json", "");
          return query.include!.includes(key);
        }) : 
        attachmentFiles;
      
      // Create optimized parallel processing for attachments
      await Promise.all(includedAttachments.map(async (attachmentFile) => {
        const key = attachmentFile.replace(".json", "");
        const attachmentPath = path.join(attachedPath, attachmentFile);
        
        // Check for where conditions before loading
        const hasWhereConditions = query.where && 
          Object.keys(query.where).some(k => k.startsWith(`${key}.`));
        
        // Try to get from cache first
        const attachmentCacheKey = getAttachedCacheKey(base.id, key);
        let docs = !query.skipCache ? documentCache.get(attachmentCacheKey) : undefined;
        
        // If not found in cache, load from disk
        if (docs === undefined) {
          try {
            docs = await loadJSONAsync(attachmentPath) || [];
            
            // Cache the result if valid
            if (docs && !query.skipCache) {
              documentCache.set(attachmentCacheKey, docs);
            }
          } catch (error) {
            console.error(`Error loading attachment ${attachmentFile}:`, error);
            return; // Skip this attachment but continue with others
          }
        }
        
        // Handle nested array structure in attached data
        const flattenedDocs = Array.isArray(docs[0]) ? docs.flat() : docs;
        
        // Decrypt if needed
        const processedDocs = query.decryptionKey ? 
          flattenedDocs.map(d => decryptFields(d, query.decryptionKey)) : 
          flattenedDocs;
        
        // Apply where conditions if needed
        let resultDocs = processedDocs;
        
        if (hasWhereConditions && query.where) {
          const keyPrefix = key + '.';
          const relevantConditions: Record<string, any> = {};
          
          // Extract only conditions relevant to this attachment
          for (const [path, condition] of Object.entries(query.where)) {
            if (path.startsWith(keyPrefix)) {
              const fieldName = path.substring(keyPrefix.length);
              relevantConditions[fieldName] = condition;
            }
          }
          
          // Apply filtering if we have conditions
          if (Object.keys(relevantConditions).length > 0) {
            resultDocs = processedDocs.filter(doc => matchCondition(doc, relevantConditions));
          }
        }
        
        // Add the resulting documents to the entry
        entry[key] = resultDocs;
      }));
    }
  }
  
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
  const results: any[] = [];
  
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
      // Reset the file exists cache for this path to ensure fresh check
      fileExistsCache.delete(anchorPath);
      
      // Check if directory exists before trying to read it
      if (query.id) {
        // If querying by ID, we don't need to read the directory
        files = [`${query.id}.json`];
      } else {
        // Do a fresh existence check
        const dirExists = fs.existsSync(anchorPath);
        console.log(`Directory check for ${anchorPath}: ${dirExists}`);
        
        if (dirExists) {
          // Only try to read directory if it exists
          files = await readdirAsync(anchorPath);
          console.log(`Found ${files.length} files in directory ${anchorPath}`);
        } else {
          // Directory doesn't exist, so no files
          files = [];
          console.log(`Directory ${anchorPath} does not exist`);
          performanceTracker.addDetail("error", `Entity type '${query.primary}' not found`);
        }
      }
      performanceTracker.addDetail("filesCount", files.length);
    } catch (error) {
      console.error("Error reading directory:", error);
      files = [];
      performanceTracker.addDetail("error", "Failed to read directory");
    }
  }
  performanceTracker.endPhase("findFiles");
  
  // Process all files in parallel with optimized batch processing
  performanceTracker.startPhase("processFiles");
  performanceTracker.addDetail("totalFiles", files.length);
  
  // Batch size for optimal parallel processing
  const BATCH_SIZE = 50; // Process 50 files at a time for better memory management
  let processedCount = 0;
  
  // Process files in batches for better memory management and performance
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    
    // Create promises for this batch
    const batchPromises = batch.map(file => processAnchorEntity(anchorPath, file, query));
    
    // Wait for this batch to complete in parallel
    const batchResults = await Promise.all(batchPromises);
    
    // Filter out null results and add non-null entries to the results
    const validResults = batchResults.filter(entry => entry !== null);
    results.push(...validResults);
    
    // Update processed count
    processedCount += batch.length;
    performanceTracker.addDetail("processedSoFar", processedCount);
  }
  
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