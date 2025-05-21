/**
 * Cache Management Endpoint Handler
 */
import { 
  documentCache, 
  queryCache, 
  fileExistsCache, 
  getAllCacheStats 
} from "../../utils/cache";

/**
 * Handle GET requests to /cache endpoint
 * Returns statistics for all application caches
 */
export function handleCacheGetRequest(): Response {
  const stats = getAllCacheStats();
  return new Response(JSON.stringify(stats, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/**
 * Handle DELETE requests to /cache endpoint
 * Clears all application caches
 */
export function handleCacheDeleteRequest(): Response {
  documentCache.clear();
  queryCache.clear();
  fileExistsCache.clear();
  
  return new Response(JSON.stringify({ 
    success: true, 
    message: "All caches cleared" 
  }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}