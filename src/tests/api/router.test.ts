/**
 * API Router Tests
 * Testing the API router functionality
 */
import { describe, test, expect, beforeAll, afterAll, mock, spyOn } from "bun:test";
import { routeRequest } from "../../api/endpoints";
import * as queryEndpoint from "../../api/endpoints/query";
import * as cacheEndpoint from "../../api/endpoints/cache";

// Track mocks for cleanup
let consoleMock: any;
let queryMock: any;
let cacheGetMock: any;
let cacheDeleteMock: any;

// Setup mocks
beforeAll(() => {
  // Mock console methods
  consoleMock = mock.module("console", () => ({
    log: () => {},
    error: () => {},
    warn: () => {},
  }));
  
  // Mock endpoint handlers with simple implementations
  queryMock = spyOn(queryEndpoint, "handleQueryRequest").mockImplementation(async (req) => {
    return new Response(JSON.stringify({ success: true, endpoint: "query" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  
  cacheGetMock = spyOn(cacheEndpoint, "handleCacheGetRequest").mockImplementation(() => {
    return new Response(JSON.stringify([{ name: "cache-stats" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  
  cacheDeleteMock = spyOn(cacheEndpoint, "handleCacheDeleteRequest").mockImplementation(() => {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
});

// Cleanup after all tests
afterAll(() => {
  if (consoleMock) {
    consoleMock.mockRestore?.();
  }
  if (queryMock) {
    queryMock.mockRestore?.();
  }
  if (cacheGetMock) {
    cacheGetMock.mockRestore?.();
  }
  if (cacheDeleteMock) {
    cacheDeleteMock.mockRestore?.();
  }
});

describe("API Router", () => {
  test("should route POST /query requests to query endpoint handler", async () => {
    const request = new Request("http://localhost/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary: "test" })
    });
    
    const response = await routeRequest(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.endpoint).toBe("query");
    expect(queryEndpoint.handleQueryRequest).toHaveBeenCalled();
  });
  
  test("should route GET /cache requests to cache endpoint handler", async () => {
    const request = new Request("http://localhost/cache", {
      method: "GET"
    });
    
    const response = await routeRequest(request);
    
    expect(response.status).toBe(200);
    expect(cacheEndpoint.handleCacheGetRequest).toHaveBeenCalled();
  });
  
  test("should route DELETE /cache requests to cache endpoint handler", async () => {
    const request = new Request("http://localhost/cache", {
      method: "DELETE"
    });
    
    const response = await routeRequest(request);
    
    expect(response.status).toBe(200);
    expect(cacheEndpoint.handleCacheDeleteRequest).toHaveBeenCalled();
  });
  
  test("should return 404 for unknown endpoints", async () => {
    const request = new Request("http://localhost/unknown-endpoint");
    
    const response = await routeRequest(request);
    
    expect(response.status).toBe(404);
  });
});