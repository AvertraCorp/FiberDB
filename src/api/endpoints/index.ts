/**
 * API Endpoints export file
 */
import { handleQueryRequest } from "./query";
import { handleCacheGetRequest, handleCacheDeleteRequest } from "./cache";

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Include-Performance-Metrics, X-Skip-Cache, X-Skip-TTL, X-Use-Parallel");
  return response;
}

/**
 * Route and handle incoming requests
 */
export async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    const response = new Response(null, { status: 200 });
    return addCorsHeaders(response);
  }
  
  // Query endpoints
  if (req.method === "POST" && url.pathname === "/query") {
    const response = await handleQueryRequest(req);
    return addCorsHeaders(response);
  }

  // Cache management endpoints
  if (url.pathname === "/cache") {
    if (req.method === "GET") {
      const response = await handleCacheGetRequest();
      return addCorsHeaders(response);
    }
    
    if (req.method === "DELETE") {
      const response = await handleCacheDeleteRequest();
      return addCorsHeaders(response);
    }
  }
  
  // Not found for all other routes
  const response = new Response("Not Found", { status: 404 });
  return addCorsHeaders(response);
}