# FiberDB Query System

This document provides a comprehensive overview of the FiberDB query system, explaining its architecture, capabilities, and advanced features.

## Table of Contents

1. [Query System Architecture](#query-system-architecture)
2. [Query Structure](#query-structure)
3. [Filtering Capabilities](#filtering-capabilities)
4. [Field Selection](#field-selection)
5. [Attachment Handling](#attachment-handling)
6. [Advanced Query Operators](#advanced-query-operators)
7. [Query Optimization](#query-optimization)
8. [Synchronous vs. Asynchronous Execution](#synchronous-vs-asynchronous-execution)
9. [Performance Metrics](#performance-metrics)
10. [Error Handling](#error-handling)

## Query System Architecture

The FiberDB query system is designed to provide a flexible, efficient way to retrieve and filter data from the database. It consists of several key components:

### Query Engine Components

1. **Query Parser**: Validates and normalizes query parameters
2. **Query Planner**: Determines the most efficient execution strategy
3. **Filter Engine**: Applies filter criteria to records
4. **Result Assembler**: Combines anchor data with attachments
5. **Cache Manager**: Integrates with the caching system
6. **Field Processor**: Handles field selection and secure field decryption

### Query Processing Flow

1. Parse and validate the query object
2. Check cache for identical previous query
3. Plan query execution (sync/async, use indexes, parallel processing)
4. Retrieve anchor documents (by ID or collection)
5. Apply primary filters
6. Retrieve and join attachment data
7. Apply attachment-based filters
8. Select requested fields
9. Process secure fields (decrypt if key provided)
10. Compile and return results

## Query Structure

A FiberDB query is structured as a JavaScript object with specific properties:

```typescript
interface QueryOptions {
  // Core query parameters
  primary: string;           // Anchor type (required)
  id?: string;               // Specific entity ID (optional)
  filter?: Record<string, any>; // Filter criteria for anchor
  include?: string[];        // Fields to include in results
  where?: Record<string, any>; // Filter criteria for attachments
  
  // Security
  decryptionKey?: string;    // Key for decrypting secure fields
  
  // Performance control
  skipCache?: boolean;       // Skip cache lookup
  useParallel?: boolean;     // Use parallel processing
  useIndexes?: boolean;      // Use index-based filtering
  includePerformanceMetrics?: boolean; // Include timing metrics
}
```

### Example Queries

#### Basic ID Query

```javascript
const result = await query({
  primary: "business-partner",
  id: "BP12345678"
});
```

#### Filtered Collection Query

```javascript
const result = await query({
  primary: "business-partner",
  filter: {
    status: "active",
    customerClassification: "A"
  },
  include: ["id", "firstName", "lastName", "addresses"]
});
```

#### Query with Attachment Filters

```javascript
const result = await query({
  primary: "business-partner",
  filter: { status: "active" },
  include: ["id", "firstName", "lastName", "addresses", "contracts"],
  where: {
    "contracts.status": { eq: "ACTIVE" },
    "addresses.city": { contains: "Springfield" }
  }
});
```

## Filtering Capabilities

FiberDB provides powerful filtering capabilities at two levels:

### Primary Filters

Primary filters (`filter` parameter) apply to fields in the anchor document:

```javascript
filter: {
  status: "active",                // Simple equality
  customerClassification: "A",
  createdAt: { gt: "2023-01-01" }  // Advanced operator
}
```

### Attachment Filters

Attachment filters (`where` parameter) apply to fields in attached documents:

```javascript
where: {
  "contracts.status": { eq: "ACTIVE" },
  "addresses.city": { contains: "Springfield" },
  "meters.isSmartMeter": true
}
```

### Filter Evaluation

Filters are evaluated as follows:

1. **Primary Filters**: Applied during anchor document retrieval
2. **Attachment Filters**: Applied after attachments are loaded
3. **Combined Logic**: All conditions must match (AND logic)

## Field Selection

The `include` parameter allows precise control over which fields are returned:

```javascript
include: ["id", "firstName", "lastName", "addresses", "contracts"]
```

### Field Selection Rules

1. If `include` is omitted, all anchor fields are returned (no attachments)
2. If `include` contains attachment names, those attachments are loaded and included
3. Attachment names refer to the entire attachment (e.g., "addresses" loads all address data)
4. To limit anchor fields, explicitly list the desired fields

### Wildcard Selection

A special wildcard syntax allows selecting all fields of a certain type:

```javascript
include: ["*", "addresses"]  // All anchor fields plus addresses
```

## Attachment Handling

Attachments are automatically loaded when:

1. Their name is listed in the `include` parameter
2. They're referenced in a `where` condition

### Attachment Loading Behavior

1. **Eager Loading**: All selected attachments are loaded automatically
2. **Parallel Loading**: When parallel processing is enabled, attachments load concurrently
3. **Cached Loading**: Previously loaded attachments use cached data when available

### Missing Attachments

When a requested attachment doesn't exist:

1. The anchor document is still returned
2. The missing attachment field is set to an empty array `[]`
3. No error is thrown (missing attachments are considered empty, not errors)

## Advanced Query Operators

FiberDB supports several advanced filter operators:

### Equality Operators

```javascript
// Exact match (equivalent to simple "status": "active")
"status": { eq: "active" }

// Not equal
"status": { ne: "inactive" }
```

### Comparison Operators

```javascript
// Greater than
"priority": { gt: 3 }

// Less than
"priority": { lt: 5 }
```

### Text Search Operators

```javascript
// Contains text (case-insensitive)
"name": { contains: "smith" }
```

### Array Operators

```javascript
// Value is in array
"region": { in: ["WEST", "SOUTH"] }
```

### Combining Operators

Multiple operators can be combined using AND logic:

```javascript
filter: {
  "status": { eq: "active" },
  "priority": { gt: 3 },
  "region": { in: ["WEST", "SOUTH"] }
}
```

## Query Optimization

FiberDB includes several optimization strategies:

### Index-Based Filtering

When `useIndexes` is true (default), the query system:

1. Checks for available indexes for filter fields
2. Uses index lookups instead of full collection scans
3. Combines multiple indexes for complex filters

### Small Query Optimization

For ID-based queries, a special optimization path:

1. Directly accesses the specific file
2. Skips collection scanning entirely
3. Delivers better performance for point lookups

### Caching System Integration

The query system integrates with multiple cache layers:

1. **Query Result Cache**: Identical queries return cached results
2. **Document Cache**: Previously loaded documents are retrieved from cache
3. **File Existence Cache**: File system checks use cached existence information

### Batch Processing

For large collections:

1. Documents are processed in batches (e.g., 50 documents at a time)
2. Reduces memory usage for large collections
3. Improves responsiveness for partial results

## Synchronous vs. Asynchronous Execution

FiberDB implements two execution models:

### Synchronous Execution

Implemented in `runStructuredQuery()`:

1. **Best For**: Small datasets, ID-based queries
2. **Advantages**: Lower overhead, simpler execution
3. **Limitations**: Blocks while processing, sequential processing only

### Asynchronous Execution

Implemented in `runStructuredQueryAsync()`:

1. **Best For**: Large datasets, complex queries
2. **Advantages**: Parallel processing, non-blocking operation
3. **Performance**: Up to 5x faster for large datasets
4. **Control**: Enabled with `useParallel: true` parameter

The query planner automatically selects the appropriate execution model based on:
1. Query type (ID vs. collection)
2. Expected result size
3. Explicit `useParallel` setting

## Performance Metrics

When `includePerformanceMetrics` is enabled, the query result includes timing information:

```javascript
result[0].__metrics = {
  total: 42.5,           // Total query time (ms)
  fileRead: 35.2,        // Time spent reading files
  filtering: 5.1,        // Time spent applying filters
  attachment: 2.2,       // Time spent processing attachments
  cacheHit: true         // Whether query used cached results
}
```

### Metric Types

1. **Total Time**: Overall query execution time
2. **File Read Time**: Time spent reading from disk/cache
3. **Filter Time**: Time spent applying filters
4. **Attachment Time**: Time spent processing attachments
5. **Cache Information**: Whether and which caches were used

## Error Handling

The query system handles several types of errors:

### Query Structure Errors

Thrown when the query format is invalid:

```javascript
throw new Error("Invalid query: missing required 'primary' field");
```

### File Access Errors

Handled gracefully with empty results or partial data:

1. **Missing Anchor Type**: Returns empty array `[]`
2. **Missing Anchor Document**: Returns empty array `[]` for ID queries
3. **Missing Attachment**: Returns empty array for that attachment

### Filter Errors

Thrown when filter criteria are invalid:

```javascript
throw new Error("Invalid filter operator: 'contains' requires string value");
```

### Decryption Errors

Thrown when decryption fails:

```javascript
throw new Error("Failed to decrypt field: invalid key or corrupted data");
```