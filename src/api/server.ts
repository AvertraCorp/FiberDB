/**
 * FiberDB API Server
 */
import { serve } from "bun";
import config from "../config";
import { routeRequest } from "./endpoints";

/**
 * Start the API server
 */
export function startServer() {
  const port = config.server.port;
  const host = config.server.host;
  
  const server = serve({
    port,
    fetch: async (req) => {
      return routeRequest(req);
    }
  });
  
  console.log(`FiberDB server running at http://${host}:${port}`);
  console.log("To include performance metrics, add X-Include-Performance-Metrics: true header to your requests");
  console.log("To skip TTL filtering for historical data, add X-Skip-TTL: true header to your requests");
  
  return server;
}

// Export a function to start the server
export default startServer;