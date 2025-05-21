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
  getCacheKey,
  getDocumentCacheKey,
  getAttachedCacheKey
} from "../../utils/cache";
import { loadJSON } from "../storage";
import { decryptFields, matchCondition } from "./utils";
import { useIndexForQuery } from "../indexing";
import type { QueryOptions } from "../../types";

// Batch size for optimized processing
// For small queries (< 10 items), this effectively processes all at once
// For larger queries, it processes in manageable chunks
const BATCH_SIZE = 50;

// Small query optimization threshold
// For very small queries, we'll use specialized optimizations
const SMALL_QUERY_THRESHOLD = 10;

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
  
  // For ID queries, fast path - skip directory listing
  if (query.id) {
    // Make sure file exists before proceeding
    const idFilePath = path.join(anchorPath, `${query.id}.json`);
    if (fs.existsSync(idFilePath)) {
      files = [`${query.id}.json`];
      performanceTracker.addDetail("idQuery", true);
    } else {
      console.log(`ID query file does not exist: ${idFilePath}`);
      files = [];
      performanceTracker.addDetail("idQueryFileNotFound", true);
    }
  }
  // If we've already found matches using indexes, use those
  else if (indexMatchedIds && indexMatchedIds.length > 0) {
    performanceTracker.addDetail("usingIndexResults", true);
    
    files = indexMatchedIds.map(id => {
      // If it already has .json extension, use as is
      if (id.endsWith('.json')) {
        return id;
      }
      return `${id}.json`;
    });
  }
  // Otherwise use the standard path with directory listing
  else {
    try {
      // Get cached list if available
      const dirCacheKey = `dir:${query.primary}`;
      let cachedFiles = !query.skipCache ? documentCache.get(dirCacheKey) : undefined;
      
      if (cachedFiles) {
        files = cachedFiles;
        performanceTracker.addDetail("usedCachedDirListing", true);
      } else {
        // Reset the file exists cache for this path to ensure fresh check
        fileExistsCache.delete(anchorPath);
        
        // Do a fresh directory check and listing
        const dirExists = fs.existsSync(anchorPath);
        
        if (dirExists) {
          // Only try to read directory if it exists
          files = fs.readdirSync(anchorPath);
          // Cache the directory listing for future queries
          if (!query.skipCache) {
            documentCache.set(dirCacheKey, files);
          }
        } else {
          // Directory doesn't exist, so no files
          files = [];
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

  performanceTracker.startPhase("processFiles");
  let processedCount = 0;
  let filteredCount = 0;

  // Fast path for ID queries and other very small queries
  // But be careful not to use it for problematic edge cases
  if (files.length <= SMALL_QUERY_THRESHOLD && (query.id || indexMatchedIds)) {
    performanceTracker.addDetail("smallQueryOptimization", true);
    
    // For tiny queries, use direct processing without batching overhead
    for (const file of files) {
      // Optimized fast path for id queries
      const entityId = file.replace('.json', '');
      const cacheKey = getDocumentCacheKey(query.primary, entityId);
      
      // Cache check is especially important for small queries
      let baseRaw;
      if (!query.skipCache) {
        baseRaw = documentCache.get(cacheKey);
        if (baseRaw) {
          performanceTracker.addDetail("cacheHits", (performanceTracker.details?.cacheHits || 0) + 1);
        }
      }
      
      if (baseRaw === undefined) {
        const filePath = path.join(anchorPath, file);
        performanceTracker.startPhase(`loadFile:${file}`);
        baseRaw = loadJSON(filePath);
        performanceTracker.endPhase(`loadFile:${file}`);
        
        // Cache aggressively for small queries
        if (baseRaw && !query.skipCache) {
          documentCache.set(cacheKey, baseRaw);
        }
        
        // Debug
        console.log(`FastPath: Loaded entity ${entityId}, found: ${baseRaw ? 'yes' : 'no'}`);
      }
      
      if (!baseRaw) continue;
      processedCount++;
      
      // Apply TTL filtering unless explicitly skipped
      if (!query.skipTTL) {
        const baseDate = new Date(baseRaw.created_at || baseRaw.createdAt || Date.now());
        if (baseDate < ttlCutoff) {
          filteredCount++;
          continue;
        }
      }

      // Fast path processing for the rest
      let base = baseRaw;
      if (query.decryptionKey && baseRaw.__secure) {
        base = decryptFields(baseRaw, query.decryptionKey);
      }
      
      // Apply filter if needed (unlikely in ID query, but possible)
      if (query.filter && !matchCondition(base, query.filter)) {
        filteredCount++;
        continue;
      }

      const entry: Record<string, any> = { id: base.id };
      if (!query.include || query.include.includes("*")) {
        Object.assign(entry, base);
      } else {
        query.include.forEach(f => { if (!f.includes(".")) entry[f] = base[f]; });
      }

      // Process attachments if needed
      if (!query.include || query.include.includes("*") || query.include.some(f => f.includes("."))) {
        const attachedPath = path.join(config.storage.baseDir, "attached", base.id);
        
        if (fs.existsSync(attachedPath)) {
          const attachmentFiles = fs.readdirSync(attachedPath);
          
          // Fast filter attachments for specific fields
          const neededFiles = query.include && !query.include.includes("*") ?
            attachmentFiles.filter(file => {
              const key = file.replace(".json", "");
              return query.include!.some(f => f === key || f.startsWith(`${key}.`));
            }) : attachmentFiles;
            
          for (const attachmentFile of neededFiles) {
            const key = attachmentFile.replace(".json", "");
            
            // Try cache first
            const attachmentCacheKey = getAttachedCacheKey(base.id, key);
            let docs = !query.skipCache ? documentCache.get(attachmentCacheKey) : undefined;
            
            if (docs === undefined) {
              docs = loadJSON(path.join(attachedPath, attachmentFile)) || [];
              
              if (docs && !query.skipCache) {
                documentCache.set(attachmentCacheKey, docs);
              }
            }
            
            // Handle nested array structure
            const flattenedDocs = Array.isArray(docs[0]) ? docs.flat() : docs;
            
            // Process docs
            let resultDocs = query.decryptionKey ? 
              flattenedDocs.map((d: any) => decryptFields(d, query.decryptionKey)) : 
              flattenedDocs;
              
            // Apply any where conditions
            if (query.where) {
              const keyPrefix = key + '.';
              const relevantConditions: Record<string, any> = {};
              
              for (const [path, condition] of Object.entries(query.where)) {
                if (path.startsWith(keyPrefix)) {
                  const fieldName = path.substring(keyPrefix.length);
                  relevantConditions[fieldName] = condition;
                }
              }
              
              if (Object.keys(relevantConditions).length > 0) {
                resultDocs = resultDocs.filter(doc => matchCondition(doc, relevantConditions));
              }
            }
            
            entry[key] = resultDocs;
          }
        }
      }
      
      results.push(entry);
    }
  }
  // Standard batch processing for larger queries or full-table scans
  else {
    // Print debug info for now
    console.log(`Using standard path for ${files.length} files, id: ${query.id}`);
    // Process files in batches for better memory management
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batchFiles = files.slice(i, i + BATCH_SIZE);
    
    for (const file of batchFiles) {
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
        performanceTracker.startPhase(`loadFile:${file}`);
        
        baseRaw = loadJSON(filePath);
        performanceTracker.endPhase(`loadFile:${file}`);
        
        // Cache the loaded document if valid
        if (baseRaw && !query.skipCache) {
          documentCache.set(cacheKey, baseRaw);
        }
      }
      
      if (!baseRaw) continue;
      processedCount++;

      // TTL filtering - unless override provided
      let skippedDueToTTL = false;
      
      // Only apply TTL filtering if not explicitly skipped
      if (!query.skipTTL) {
        const baseDate = new Date(baseRaw.created_at || baseRaw.createdAt || Date.now());
        skippedDueToTTL = baseDate < ttlCutoff;
        
        if (skippedDueToTTL) {
          performanceTracker.addDetail("ttlFiltered", (performanceTracker.details?.ttlFiltered || 0) + 1);
          filteredCount++;
          continue;
        }
      }
      
      // Apply primary filtering early for fast rejection
      let base = baseRaw;
      if (query.filter) {
        // Pre-decrypt if using secure fields in filter
        if (query.decryptionKey && baseRaw.__secure) {
          performanceTracker.startPhase("decryption");
          base = decryptFields(baseRaw, query.decryptionKey);
          performanceTracker.endPhase("decryption");
        }
        
        performanceTracker.startPhase("primaryFiltering");
        const filterMatches = matchCondition(base, query.filter);
        performanceTracker.endPhase("primaryFiltering");
        
        if (!filterMatches) {
          filteredCount++;
          continue;
        }
      } else if (query.decryptionKey && baseRaw.__secure) {
        // Need to decrypt but wasn't needed for filtering
        performanceTracker.startPhase("decryption");
        base = decryptFields(baseRaw, query.decryptionKey);
        performanceTracker.endPhase("decryption");
      }

      performanceTracker.startPhase("prepareResult");
      const entry: Record<string, any> = { id: base.id };
      if (!query.include || query.include.includes("*")) {
        Object.assign(entry, base);
      } else {
        query.include.forEach(f => { if (!f.includes(".")) entry[f] = base[f]; });
      }
      performanceTracker.endPhase("prepareResult");

      // Only process attachments if needed
      const needsAttachments = !query.include || 
        query.include.includes("*") || 
        query.include.some(f => f.includes("."));
        
      if (needsAttachments) {
        const attachedPath = path.join(config.storage.baseDir, "attached", base.id);
        
        performanceTracker.startPhase("processAttachments");
        let attachmentsProcessed = 0;
        
        if (fs.existsSync(attachedPath)) {
          // Get list of all attachment files
          const attachmentFiles = fs.readdirSync(attachedPath);
          
          // Filter to only required attachments to reduce processing
          const includedAttachments = query.include && !query.include.includes("*") ?
            attachmentFiles.filter(file => {
              const key = file.replace(".json", "");
              return query.include!.some(field => field === key || field.startsWith(`${key}.`));
            }) : 
            attachmentFiles;
          
          for (const attachmentFile of includedAttachments) {
            performanceTracker.startPhase(`attachment:${attachmentFile}`);
            const key = attachmentFile.replace(".json", "");
            attachmentsProcessed++;
            
            // Check for where conditions related to this attachment
            const hasWhereConditions = query.where && 
              Object.keys(query.where).some(k => k.startsWith(`${key}.`));
            
            // Try to get from cache first
            const attachmentCacheKey = getAttachedCacheKey(base.id, key);
            let docs = !query.skipCache ? documentCache.get(attachmentCacheKey) : undefined;
            
            // If not found in cache, load from disk
            if (docs === undefined) {
              docs = loadJSON(path.join(attachedPath, attachmentFile)) || [];
              
              // Cache the result if valid
              if (docs && !query.skipCache) {
                documentCache.set(attachmentCacheKey, docs);
              }
            }
            
            // Handle nested array structure in attached data
            const flattenedDocs = Array.isArray(docs[0]) ? docs.flat() : docs;
            
            // Decrypt if needed
            const processedDocs = query.decryptionKey ? 
              flattenedDocs.map((d: any) => decryptFields(d, query.decryptionKey)) : 
              flattenedDocs;
            
            // Apply where conditions if needed
            let resultDocs = processedDocs;
            
            if (hasWhereConditions && query.where) {
              performanceTracker.startPhase("filterAttachments");
              
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
                performanceTracker.addDetail(`${key}Filtered`, {
                  before: processedDocs.length,
                  after: resultDocs.length
                });
              }
              
              performanceTracker.endPhase("filterAttachments");
            }
            
            entry[key] = resultDocs;
            performanceTracker.endPhase(`attachment:${attachmentFile}`);
          }
        }
        
        performanceTracker.addDetail("attachmentsProcessed", attachmentsProcessed);
        performanceTracker.endPhase("processAttachments");
      }
      
      results.push(entry);
    }
    
    // Update the processed so far counter after each batch
    performanceTracker.addDetail("processedSoFar", i + Math.min(BATCH_SIZE, files.length - i));
    }
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