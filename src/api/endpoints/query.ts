/**
 * Query Endpoint Handler
 */
import { query, runStructuredQuery, runStructuredQueryAsync } from "../../core/query";

/**
 * Handle POST requests to /query endpoint
 */
export async function handleQueryRequest(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    
    // Enable performance metrics if requested in headers
    const includeMetrics = req.headers.get("X-Include-Performance-Metrics") === "true";
    body.includePerformanceMetrics = includeMetrics;
    
    // Skip cache if requested
    const skipCache = req.headers.get("X-Skip-Cache") === "true";
    body.skipCache = skipCache;
    
    // Skip TTL filtering if requested (for historical data)
    const skipTTL = req.headers.get("X-Skip-TTL") === "true";
    body.skipTTL = skipTTL;
    
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
        ...(skipTTL ? { "X-TTL-Skipped": "true" } : {}),
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