/**
 * Query Module - Main export with both synchronous and asynchronous query engines
 */
import config from "../../config";
import { runStructuredQuery } from "./sync";
import { runStructuredQueryAsync } from "./async";
import type { QueryOptions } from "../../types";

/**
 * Unified query function that selects the appropriate query implementation
 * based on query options and configuration
 */
export async function query(options: QueryOptions) {
  // Use parallel processing if specifically requested
  // or if defaulted to parallel in config and not explicitly disabled
  const useParallel = options.useParallel || 
    (config.performance.defaultParallel && options.useParallel !== false);
  
  if (useParallel) {
    return runStructuredQueryAsync(options);
  } else {
    return runStructuredQuery(options);
  }
}

// Export both implementations for direct usage
export {
  runStructuredQuery,
  runStructuredQueryAsync
};