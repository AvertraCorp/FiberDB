/**
 * FiberDB API Server
 */
import { serve } from "bun";
import config from "../config";
import { query, runStructuredQuery, runStructuredQueryAsync } from "../core/query";
import { 
  documentCache, 
  queryCache, 
  fileExistsCache, 
  getAllCacheStats 
} from "../utils/cache";

/**
 * Start the API server
 */
export function startServer() {
  const port = config.server.port;
  const host = config.server.host;
  
  const server = serve({
    port,
    fetch: async (req) => {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/query") {
        try {
          const body = await req.json();
          
          // Enable performance metrics if requested in headers
          const includeMetrics = req.headers.get("X-Include-Performance-Metrics") === "true";
          body.includePerformanceMetrics = includeMetrics;
          
          // Skip cache if requested
          const skipCache = req.headers.get("X-Skip-Cache") === "true";
          body.skipCache = skipCache;
          
          // Use parallel processing if requested
          const useParallel = req.headers.get("X-Use-Parallel") === "true";
          let result;
          
          // Run the appropriate query function
          if (useParallel) {
            result = await runStructuredQueryAsync(body);
          } else {
            result = runStructuredQuery(body);
          }

          return new Response(JSON.stringify(result, null, 2), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              ...(includeMetrics ? { "X-Performance-Included": "true" } : {}),
              ...(skipCache ? { "X-Cache-Skipped": "true" } : {}),
              ...(useParallel ? { "X-Parallel-Processing": "true" } : {})
            }
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
      }
      
      // Cache management API
      if (url.pathname === "/cache") {
        // Get cache stats
        if (req.method === "GET") {
          const stats = getAllCacheStats();
          return new Response(JSON.stringify(stats, null, 2), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        
        // Clear caches
        if (req.method === "DELETE") {
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
      }

      return new Response("Not Found", { status: 404 });
    }
  });
  
  console.log(`FiberDB server running at http://${host}:${port}`);
  console.log("To include performance metrics, add X-Include-Performance-Metrics: true header to your requests");
  
  return server;
}

// Export a function to start the server
export default startServer;