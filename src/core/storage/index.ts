/**
 * Storage Module - Handles data persistence and file operations
 */
import fs from "fs";
import path from "path";
import config from "../../config";
import { encrypt } from "../crypto";
import { performanceTracker } from "../../utils/performance";
import { 
  documentCache, 
  queryCache, 
  fileExistsCache, 
  invalidateEntityCaches,
  getDocumentCacheKey,
  getAttachedCacheKey
} from "../../utils/cache";
import type { StorageOptions } from "../../types";

const baseDir = config.storage.baseDir;

/**
 * Ensure directory exists
 * @param dir Directory path to check/create
 */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Save an anchor entity to storage
 */
export function saveAnchor(
  type: string, 
  id: string, 
  data: any, 
  options?: StorageOptions
) {
  // Start performance tracking
  performanceTracker.start(`SaveAnchor ${type}:${id}`);
  performanceTracker.addDetail("entityType", type);
  performanceTracker.addDetail("entityId", id);
  performanceTracker.addDetail("dataSize", JSON.stringify(data).length);
  performanceTracker.addDetail("hasSecureFields", !!options?.secureFields);
  
  performanceTracker.startPhase("preparePath");
  const anchorPath = path.join(baseDir, "anchors", type, `${id}.json`);
  ensureDir(path.dirname(anchorPath));
  performanceTracker.endPhase("preparePath");

  if (options?.secureFields && options.key) {
    performanceTracker.startPhase("encryption");
    for (const field of options.secureFields) {
      if (data[field]) {
        data[field] = encrypt(data[field], options.key);
      }
    }
    data.__secure = options.secureFields;
    performanceTracker.addDetail("encryptedFields", options.secureFields.length);
    performanceTracker.endPhase("encryption");
  }

  performanceTracker.startPhase("writeFile");
  fs.writeFileSync(anchorPath, JSON.stringify(data, null, 2));
  performanceTracker.endPhase("writeFile");
  
  // Invalidate relevant caches
  performanceTracker.startPhase("cacheInvalidation");
  
  // Invalidate document cache for this specific entity
  const docCacheKey = getDocumentCacheKey(type, id);
  documentCache.delete(docCacheKey);
  
  // Invalidate file exists cache
  fileExistsCache.delete(anchorPath);
  
  // Clear query cache since results might be affected
  queryCache.clear();
  
  performanceTracker.addDetail("cachesInvalidated", true);
  performanceTracker.endPhase("cacheInvalidation");
  
  const metrics = performanceTracker.end();
  
  if (options?.includePerformanceMetrics) {
    console.log(performanceTracker.formatMetrics(metrics));
  }
  
  return metrics;
}

/**
 * Attach a document to an anchor entity
 */
export function attachToAnchor(
  anchorId: string, 
  docType: string, 
  doc: any, 
  options?: StorageOptions
) {
  // Start performance tracking
  performanceTracker.start(`AttachToAnchor ${anchorId}:${docType}`);
  performanceTracker.addDetail("anchorId", anchorId);
  performanceTracker.addDetail("documentType", docType);
  performanceTracker.addDetail("documentSize", JSON.stringify(doc).length);
  performanceTracker.addDetail("hasSecureFields", !!options?.secureFields);
  
  performanceTracker.startPhase("preparePath");
  const dir = path.join(baseDir, "attached", anchorId);
  ensureDir(dir);
  const filePath = path.join(dir, `${docType}.json`);
  performanceTracker.endPhase("preparePath");

  performanceTracker.startPhase("readExisting");
  let existing: any[] = [];
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
    performanceTracker.addDetail("existingDocuments", existing.length);
  }
  performanceTracker.endPhase("readExisting");

  if (options?.secureFields && options.key) {
    performanceTracker.startPhase("encryption");
    for (const field of options.secureFields) {
      if (doc[field]) {
        doc[field] = encrypt(doc[field], options.key);
      }
    }
    doc.__secure = options.secureFields;
    performanceTracker.addDetail("encryptedFields", options.secureFields.length);
    performanceTracker.endPhase("encryption");
  }

  performanceTracker.startPhase("writeFile");
  existing.push(doc);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
  performanceTracker.endPhase("writeFile");
  
  // Invalidate relevant caches
  performanceTracker.startPhase("cacheInvalidation");
  
  // Invalidate document cache for this attached document
  const attachedCacheKey = getAttachedCacheKey(anchorId, docType);
  documentCache.delete(attachedCacheKey);
  
  // Invalidate the file exists cache for this path
  fileExistsCache.delete(filePath);
  
  // Clear query cache since results might be affected
  queryCache.clear();
  
  performanceTracker.addDetail("cachesInvalidated", true);
  performanceTracker.endPhase("cacheInvalidation");
  
  const metrics = performanceTracker.end();
  
  if (options?.includePerformanceMetrics) {
    console.log(performanceTracker.formatMetrics(metrics));
  }
  
  return metrics;
}

/**
 * Load a JSON file synchronously (with caching)
 */
export function loadJSON(filePath: string) {
  try {
    // First check the cache before hitting the file system
    const cacheKey = filePath;
    const cachedDoc = documentCache.get(cacheKey);
    
    // If found in cache, return it
    if (cachedDoc !== undefined) {
      performanceTracker.addDetail("cacheHit", filePath);
      return cachedDoc;
    }
    
    // Check if the file exists (using cached file existence info)
    const exists = fileExistsCache.get(filePath);
    if (exists === false) {
      // We already know this file doesn't exist
      performanceTracker.addDetail("fileExistsCacheHit", filePath);
      return null;
    }
    
    // Actually check if the file exists on disk
    if (!fs.existsSync(filePath)) {
      // Cache the fact that the file doesn't exist to avoid future checks
      fileExistsCache.set(filePath, false);
      return null;
    }
    
    // Cache that the file exists
    fileExistsCache.set(filePath, true);
    
    // Read and parse the file content
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);
    
    // Cache the parsed document for future use
    documentCache.set(cacheKey, parsed);
    
    return parsed;
  } catch (error) {
    console.error(`Error loading JSON from ${filePath}:`, error);
    return null;
  }
}

/**
 * Load a JSON file asynchronously (with caching)
 */
export async function loadJSONAsync(filePath: string): Promise<any> {
  try {
    // First check the cache before hitting the file system
    const cacheKey = filePath;
    const cachedDoc = documentCache.get(cacheKey);
    
    // If found in cache, return it
    if (cachedDoc !== undefined) {
      performanceTracker.addDetail("cacheHit", filePath);
      return cachedDoc;
    }
    
    // Check if the file exists (using cached file existence info)
    const exists = fileExistsCache.get(filePath);
    if (exists === false) {
      // We already know this file doesn't exist
      performanceTracker.addDetail("fileExistsCacheHit", filePath);
      return null;
    }
    
    // We'll use the async file existence check by trying to read the file
    try {
      // Read and parse the file content asynchronously with Bun's optimized file reading
      const content = await Bun.file(filePath).text();
      const parsed = JSON.parse(content);
      
      // Cache that the file exists and its content
      fileExistsCache.set(filePath, true);
      documentCache.set(cacheKey, parsed);
      
      return parsed;
    } catch (readError) {
      // File doesn't exist or can't be read
      fileExistsCache.set(filePath, false);
      return null;
    }
  } catch (error) {
    console.error(`Error loading JSON from ${filePath}:`, error);
    return null;
  }
}

/**
 * Check if a file exists asynchronously
 */
export async function existsAsync(filePath: string): Promise<boolean> {
  // Check cache first
  const cached = fileExistsCache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }
  
  try {
    await Bun.file(filePath).size();
    fileExistsCache.set(filePath, true);
    return true;
  } catch {
    fileExistsCache.set(filePath, false);
    return false;
  }
}

/**
 * Get list of files in a directory asynchronously
 */
export async function readdirAsync(dirPath: string): Promise<string[]> {
  try {
    return await fs.promises.readdir(dirPath);
  } catch {
    return [];
  }
}