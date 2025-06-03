# FiberDB API Endpoints Reference

This document describes all available API endpoints in detail.

## Query Endpoint

**Endpoint**: `/query`  
**Method**: POST  
**Content-Type**: application/json

The query endpoint is the primary way to interact with FiberDB data. It accepts a structured query and returns matching results.

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| primary | string | Yes | The anchor type to query (e.g., "business-partner") |
| id | string | No | Specific entity ID to retrieve. If provided, other filtering is ignored |
| filter | object | No | Key-value pairs for filtering anchor entities |
| include | array | No | Array of field names to include in the response. Can include both anchor fields and attachment names |
| where | object | No | Criteria for filtering based on attached documents |
| decryptionKey | string | No | Key to decrypt sensitive fields |
| skipCache | boolean | No | If true, forces a fresh query without using cache |
| useParallel | boolean | No | If true, enables parallel processing for the query |
| useIndexes | boolean | No | If true, uses indexes for filtering (enabled by default) |
| includePerformanceMetrics | boolean | No | If true, includes timing information in the response |

### Filter Operators

The `filter` and `where` parameters accept the following operators:

| Operator | Description | Example |
|----------|-------------|---------|
| eq | Equal to | `{"status": {"eq": "active"}}` |
| ne | Not equal to | `{"status": {"ne": "inactive"}}` |
| gt | Greater than | `{"priority": {"gt": 2}}` |
| lt | Less than | `{"priority": {"lt": 5}}` |
| contains | Text contains | `{"name": {"contains": "Smith"}}` |
| in | Value in array | `{"region": {"in": ["WEST", "EAST"]}}` |

Simple equality can also be expressed directly:

```json
"filter": { "status": "active" }
```

This is equivalent to:

```json
"filter": { "status": { "eq": "active" } }
```

### Response Format

The response is an array of matching entities:

```json
[
  {
    "id": "BP12345678",
    "firstName": "John",
    "lastName": "Doe",
    "addresses": [
      {
        "street": "123 Main St",
        "city": "Springfield"
      }
    ]
  },
  {
    // Another entity
  }
]
```

If `includePerformanceMetrics` is enabled, each entity will include a `__metrics` property with timing information:

```json
"__metrics": {
  "total": 42.5,
  "fileRead": 35.2,
  "filtering": 5.1,
  "attachment": 2.2
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| 400 | InvalidQueryError | Missing or invalid query parameters |
| 400 | FilterError | Invalid filter criteria |
| 404 | NotFoundError | Specified entity not found |
| 500 | InternalError | Unexpected server error |

## Cache Management Endpoints

### Get Cache Statistics

**Endpoint**: `/cache`  
**Method**: GET

Returns statistics about the current state of FiberDB caches.

#### Response Format

```json
{
  "documentCache": {
    "size": 128,
    "maxSize": 1000,
    "hitRate": 0.87
  },
  "queryCache": {
    "size": 24,
    "maxSize": 100,
    "hitRate": 0.92
  },
  "fileExistsCache": {
    "size": 536,
    "maxSize": 5000,
    "hitRate": 0.98
  }
}
```

### Clear Caches

**Endpoint**: `/cache`  
**Method**: DELETE

Clears all FiberDB caches. This is useful for testing or when you know the data has changed externally.

#### Response Format

```json
{
  "success": true,
  "message": "All caches cleared"
}
```


## Error Response Format

All error responses follow this format:

```json
{
  "error": "ErrorType",
  "message": "Human-readable error message",
  "details": {
    // Additional error-specific details
  }
}
```