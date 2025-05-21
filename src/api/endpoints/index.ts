/**
 * API Endpoints export file
 */
import { handleQueryRequest } from "./query";
import { handleCacheGetRequest, handleCacheDeleteRequest } from "./cache";

/**
 * Route and handle incoming requests
 */
export async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Query endpoints
  if (req.method === "POST" && url.pathname === "/query") {
    return handleQueryRequest(req);
  }

  // Cache management endpoints
  if (url.pathname === "/cache") {
    if (req.method === "GET") {
      return handleCacheGetRequest();
    }
    
    if (req.method === "DELETE") {
      return handleCacheDeleteRequest();
    }
  }
  
  // Not found for all other routes
  return new Response("Not Found", { status: 404 });
}