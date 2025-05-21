# FiberDB API Documentation

This document provides detailed information about the FiberDB HTTP API.

## Table of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
3. [Query Endpoint](#query-endpoint)
4. [Performance Control Headers](#performance-control-headers)
5. [Error Handling](#error-handling)
6. [Authentication](#authentication)
7. [Examples](#examples)

## Overview

FiberDB provides a RESTful HTTP API for interacting with the database. The API allows you to:

- Query anchor entities with flexible filtering
- Include attached documents in query results
- Control performance optimizations via request headers
- Access cache statistics and management

The API server is built on top of the FiberDB core and provides a simple interface for applications to access the database without directly interacting with the file system.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /query   | Execute a structured query against the database |
| GET    | /cache   | Retrieve cache statistics |
| DELETE | /cache   | Clear all caches |
| GET    | /health  | Check API health status |

## Query Endpoint

The primary endpoint is `/query`, which accepts POST requests with a JSON body defining the query parameters.

### Request Format

```json
{
  "primary": "business-partner",     // Required: The anchor type to query
  "id": "BP12345678",                // Optional: Specific entity ID
  "filter": {                        // Optional: Filter criteria for anchor entities
    "status": "active",
    "customerClassification": "A"
  },
  "include": [                       // Optional: Fields to include in the response
    "firstName", 
    "lastName", 
    "addresses", 
    "contracts"
  ],
  "where": {                         // Optional: Filter criteria for attached documents
    "contracts.status": { "eq": "ACTIVE" },
    "addresses.city": { "contains": "Springfield" }
  },
  "decryptionKey": "encryption-key", // Optional: Key for decrypting secure fields
  "skipCache": false,                // Optional: Force fresh data from storage
  "useParallel": true,               // Optional: Enable parallel processing
  "useIndexes": true,                // Optional: Use indexes for filtering
  "includePerformanceMetrics": true  // Optional: Include timing metrics in response
}
```

### Response Format

```json
[
  {
    "id": "BP12345678",
    "firstName": "John",
    "lastName": "Doe",
    "addresses": [
      {
        "street": "123 Main St",
        "city": "Springfield",
        "postalCode": "12345"
      }
    ],
    "contracts": [
      {
        "contractId": "CT12345",
        "status": "ACTIVE",
        "utilityType": "ELEC"
      }
    ],
    "__metrics": {
      "total": 42.5,
      "fileRead": 35.2,
      "filtering": 5.1,
      "attachment": 2.2
    }
  }
]
```

## Performance Control Headers

You can control performance features through HTTP headers:

| Header                      | Value   | Description                                   |
|-----------------------------|---------|-----------------------------------------------|
| X-Skip-Cache                | true    | Force a fresh query without using cache       |
| X-Use-Parallel              | true    | Enable parallel processing for the query      |
| X-Include-Performance-Metrics | true  | Include detailed timing information           |

These headers override any settings in the request body.

## Error Handling

The API uses standard HTTP status codes:

| Status Code | Description                                                |
|-------------|------------------------------------------------------------|
| 200         | Success                                                     |
| 400         | Bad Request - Invalid query parameters                      |
| 404         | Not Found - Entity or attachment not found                  |
| 500         | Internal Server Error - Unexpected server error             |

Error responses include a JSON body with error details:

```json
{
  "error": "InvalidQueryError",
  "message": "Missing required 'primary' field in query",
  "details": {
    "missingFields": ["primary"]
  }
}
```

## Authentication

The current version of FiberDB API does not include built-in authentication. For production use, it is recommended to place the API behind an API gateway or reverse proxy that handles authentication and authorization.

## Examples

### Basic Query

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{
    "primary": "business-partner",
    "filter": { "customerClassification": "A" },
    "include": ["firstName", "lastName"]
  }'
```

### Query with Attached Documents

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{
    "primary": "business-partner",
    "filter": { "customerClassification": "A" },
    "include": ["firstName", "lastName", "contracts"],
    "where": {
      "contracts.status": { "eq": "ACTIVE" }
    }
  }'
```

### Query with Performance Controls

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -H "X-Skip-Cache: false" \
  -H "X-Use-Parallel: true" \
  -H "X-Include-Performance-Metrics: true" \
  -d '{
    "primary": "business-partner",
    "filter": { "customerClassification": "A" }
  }'
```

### Access Cache Statistics

```bash
curl -X GET http://localhost:4000/cache
```

### Clear All Caches

```bash
curl -X DELETE http://localhost:4000/cache
```