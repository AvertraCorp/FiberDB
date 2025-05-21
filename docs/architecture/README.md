# FiberDB Architecture Documentation

This document provides a detailed overview of the FiberDB architecture, explaining the core components, design principles, and how the system works internally.

## Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Core Components](#core-components)
3. [Data Storage Model](#data-storage-model)
4. [Query Processing Pipeline](#query-processing-pipeline)
5. [Caching System](#caching-system)
6. [Indexing System](#indexing-system)
7. [Security and Encryption](#security-and-encryption)
8. [Performance Optimizations](#performance-optimizations)
9. [API Layer](#api-layer)
10. [Configuration System](#configuration-system)

## Architectural Overview

FiberDB is designed as a lightweight document database with federated capabilities, specifically tailored for applications that need to integrate data from multiple sources while maintaining flexible relationships between entities.

The architecture follows these design principles:

1. **Separation of Core Entities from Related Data**: Using the anchor-attachment model
2. **Schema Flexibility**: Supporting structured and semi-structured data
3. **Field-Level Security**: Encrypting sensitive fields while keeping others accessible
4. **Performance-First Design**: Multiple layers of caching and optimization
5. **Simple API Surface**: Unified query interface with powerful filtering capabilities

![FiberDB Architecture Overview](../assets/architecture-overview.png)

## Core Components

FiberDB consists of several key components:

### Storage Layer

- **File System Abstraction**: Handles reading and writing to the filesystem
- **JSON Document Store**: Manages persistence of JSON documents
- **Directory Structure Management**: Organizes files according to entity relationships

### Query Layer

- **Query Parser**: Processes structured query requests
- **Query Planner**: Determines the most efficient way to execute queries
- **Filter Engine**: Applies filtering criteria to entities and attachments
- **Result Processor**: Assembles and formats query results

### Indexing Subsystem

- **Index Manager**: Creates and maintains indexes
- **Index Storage**: Persists index information
- **Index-Based Lookup**: Accelerates queries using available indexes

### Caching Subsystem

- **Document Cache**: LRU cache for frequently accessed documents
- **Query Result Cache**: Stores results of recent queries
- **File Existence Cache**: Optimizes filesystem checks

### Security Layer

- **Field-level Encryption**: Encrypts sensitive fields within documents
- **Key Management**: Handles encryption and decryption keys
- **Secure Field Processing**: Special handling for encrypted fields in queries

### API Layer

- **HTTP Server**: Exposes database functionality through REST endpoints
- **Request Handling**: Processes API requests and marshals responses
- **Performance Controls**: Allows configuration of optimizations via API

## Data Storage Model

FiberDB uses a two-tier storage model:

### Anchor Documents

Anchor documents are the primary entities in the system. Each anchor:
- Has a unique ID within its type
- Contains core attributes of the entity
- Serves as a reference point for attached documents
- Is stored in `data/anchors/{anchor-type}/{id}.json`

Example anchor document (`data/anchors/business-partner/BP12345678.json`):

```json
{
  "id": "BP12345678",
  "firstName": "John",
  "lastName": "Doe",
  "customerClassification": "A",
  "birthDate": "1985-05-15"
}
```

### Attached Documents

Attached documents contain related data for an anchor. Each attachment:
- Is linked to exactly one anchor document
- Contains an array of related items
- Can have its own structure independent of the anchor
- Is stored in `data/attached/{anchor-id}/{attachment-type}.json`

Example attached document (`data/attached/BP12345678/addresses.json`):

```json
[
  {
    "street": "123 Main St",
    "city": "Springfield",
    "postalCode": "12345",
    "addressType": "BILL"
  },
  {
    "street": "456 Oak Ave",
    "city": "Riverside",
    "postalCode": "67890",
    "addressType": "INSTALL"
  }
]
```

This two-tier model provides:
1. **Vertical Partitioning**: Core entity data is separate from related data
2. **Efficient Updates**: Attachments can be updated without affecting the anchor
3. **Lazy Loading**: Related data is only loaded when needed
4. **Simple Schema Migration**: New attachment types can be added without changing anchors

## Query Processing Pipeline

FiberDB's query processing follows a multi-stage pipeline:

1. **Query Parsing**:
   - Validate the query structure
   - Identify required operation type (ID-based, full collection, filtered)
   - Extract filters, field selections, and options

2. **Cache Checking**:
   - Check if identical query exists in query cache
   - Return cached results if available and cache not skipped

3. **Execution Planning**:
   - Determine most efficient retrieval strategy
   - Select between synchronous and asynchronous processing
   - Identify usable indexes

4. **Anchor Data Retrieval**:
   - For ID queries: Load specific anchor document
   - For collection queries: Load and filter all documents of the type
   - Apply primary filters during or after loading (depending on indexes)

5. **Attachment Processing**:
   - Identify required attachments from `include` parameter
   - Load relevant attachments for matching anchors
   - Apply secondary filters (`where` conditions) on attachments

6. **Result Assembly**:
   - Apply field selection to limit returned fields
   - Merge anchor and attachment data
   - Process encrypted fields (decrypt if key provided)
   - Add performance metrics if requested

7. **Result Caching**:
   - Store query results in cache for future use
   - Update document cache with loaded documents

This pipeline is implemented in two variants:
- **Synchronous**: Better for small datasets and ID-based queries
- **Asynchronous**: Better for large datasets with parallel processing

## Caching System

FiberDB employs a multi-level caching system to optimize performance:

### Document Cache

- **Implementation**: LRU (Least Recently Used) cache
- **Purpose**: Stores frequently accessed JSON documents
- **Benefits**: Reduces disk I/O and JSON parsing overhead
- **Key Format**: `{anchor-type}:{document-id}` or `attached:{anchor-id}:{attachment-type}`
- **Configuration**: Size limit and TTL (Time To Live)

### Query Result Cache

- **Implementation**: LRU cache
- **Purpose**: Stores complete query results
- **Benefits**: Eliminates processing for repeated identical queries
- **Key Format**: Hash of the complete query parameters
- **Configuration**: Size limit and TTL

### File Existence Cache

- **Implementation**: LRU cache
- **Purpose**: Stores results of file existence checks
- **Benefits**: Reduces filesystem operations
- **Key Format**: Absolute file path
- **Configuration**: Size limit and TTL

### Cache Invalidation

- **Write-Through Caching**: Updates caches when data is written
- **Automatic Expiration**: TTL-based expiration for cache entries
- **Manual Invalidation**: API endpoint to clear caches

## Indexing System

The indexing system accelerates query performance:

### Index Types

- **Hash Indexes**: For equality filters (`eq`, exact matches)
- **Range Indexes**: For comparison filters (`gt`, `lt`)
- **Text Indexes**: For text search filters (`contains`)
- **Composite Indexes**: For multi-field filters

### Index Structure

Indexes are stored as separate files in an index directory:

```
data/_indexes/{anchor-type}/{field-name}.idx
```

The index file contains a mapping from values to document IDs:

```json
{
  "active": ["BP12345", "BP67890", "BP24680"],
  "inactive": ["BP13579", "BP97531"]
}
```

### Index Maintenance

- **Automatic Updates**: Indexes are updated when data is written
- **Rebuild Process**: Complete index rebuilding for consistency
- **Selective Indexing**: Only commonly queried fields are indexed

## Security and Encryption

FiberDB includes field-level encryption for sensitive data:

### Encryption Process

1. During document storage, specified fields are encrypted using AES-256
2. The encrypted value is stored in the document instead of the original
3. A flag is added to indicate the field is encrypted

Example of a document with encrypted fields:
```json
{
  "id": "BP12345678",
  "firstName": {
    "_encrypted": true,
    "value": "U2FsdGVkX1/8tG+Wn0RWEfm8o2Bx9gTH1MV53vAJIF4="
  },
  "lastName": {
    "_encrypted": true,
    "value": "U2FsdGVkX1/KjVOLaHYcQGQQr6Ul5ygT8DmxmPLLU9s="
  },
  "customerClassification": "A"
}
```

### Decryption Process

1. When a query includes a decryption key, encrypted fields are identified
2. The decryption key is used to decrypt these fields
3. Decrypted values replace the encrypted values in the response

### Security Considerations

- Encryption key is never stored with the data
- Keys must be provided by the client for each query
- Without the key, encrypted fields remain encrypted in query results
- All encryption is performed using industry-standard AES-256 algorithm

## Performance Optimizations

FiberDB includes multiple performance optimizations:

### Synchronous vs. Asynchronous Processing

- **Small Datasets**: Synchronous processing is more efficient
- **Large Datasets**: Asynchronous parallel processing provides significant speedup

### Batch Processing

- Documents are processed in batches to optimize memory usage
- Batch size is automatically adjusted based on dataset size

### Parallel Processing

- Multiple files are read concurrently using async/await patterns
- Promise.all is used to process attachments in parallel
- Provides up to 5x performance improvement for large datasets

### Smart Query Planning

- ID-based queries use direct file access
- Filter-based queries use available indexes
- Where conditions are applied efficiently

### Performance Metrics

- Detailed timing for various stages of query processing
- Used to identify bottlenecks and optimize performance
- Available as an optional part of query responses

## API Layer

The API layer provides a REST interface to FiberDB:

### Server Implementation

- Built using Bun's HTTP server capabilities
- Handles request parsing and response formatting
- Maps HTTP requests to core database operations

### Endpoints

- `/query`: Primary endpoint for executing structured queries
- `/cache`: Endpoint for cache statistics and management
- `/health`: Health check endpoint

### Request Processing

1. Parse incoming request body
2. Validate request parameters
3. Execute query using core query engine
4. Format and return response

### Performance Control Headers

Special headers allow control of performance options:
- `X-Skip-Cache`: Force fresh data retrieval
- `X-Use-Parallel`: Enable parallel processing
- `X-Include-Performance-Metrics`: Include timing information

## Configuration System

FiberDB's behavior is controlled through a central configuration system:

### Configuration Sources

1. Default values defined in `config.ts`
2. Environment variables override defaults
3. Runtime options in queries override environment settings

### Configurable Parameters

- **Server**: Port, host
- **Storage**: Base directory, TTL days
- **Cache**: Size limits, TTL durations
- **Crypto**: Algorithm, initialization vector
- **Indexing**: Enable/disable, auto-rebuild
- **Performance**: Default parallel processing, metrics logging

Example configuration (from `config.ts`):

```typescript
export default {
  server: {
    port: process.env.PORT || 4001,
    host: process.env.HOST || 'localhost',
  },
  
  storage: {
    baseDir: process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(cwd, 'data'),
    ttlDays: parseInt(process.env.TTL_DAYS || '180', 10),
  },
  
  cache: {
    documentCacheSize: parseInt(process.env.DOCUMENT_CACHE_SIZE || '1000', 10),
    queryCacheSize: parseInt(process.env.QUERY_CACHE_SIZE || '100', 10),
    fileCheckCacheSize: parseInt(process.env.FILE_CHECK_CACHE_SIZE || '5000', 10),
    ttlShort: 60000,      // 1 minute
    ttlMedium: 300000,    // 5 minutes
    ttlLong: 900000,      // 15 minutes
  },
  
  // ...other configuration sections
};
```