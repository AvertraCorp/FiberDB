# FiberDB Storage Model

This document describes the FiberDB storage model in detail, explaining how data is organized, stored, and accessed on disk.

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [Anchor Documents](#anchor-documents)
3. [Attached Documents](#attached-documents)
4. [Indexes](#indexes)
5. [Data Storage Format](#data-storage-format)
6. [File Naming Conventions](#file-naming-conventions)
7. [Storage Operations](#storage-operations)

## Directory Structure

FiberDB organizes its data storage in a specific directory structure:

```
data/
├── anchors/                  # Primary entity storage
│   ├── business-partner/     # Entities of type "business-partner"
│   │   ├── BP12345678.json   # Individual anchor documents
│   │   ├── BP87654321.json
│   │   └── ...
│   └── asset/                # Entities of type "asset"
│       ├── ASSET001.json
│       └── ...
├── attached/                 # Related document storage
│   ├── BP12345678/           # Attachments for specific anchor
│   │   ├── addresses.json    # Address attachment
│   │   ├── contracts.json    # Contracts attachment
│   │   └── ...
│   └── BP87654321/
│       └── ...
└── _indexes/                 # Index storage
    ├── business-partner/
    │   ├── status.idx        # Index on status field
    │   └── ...
    └── ...
```

This structure provides:

1. **Clear Separation**: Core entities are separate from their related data
2. **Logical Organization**: Data is grouped by entity type and ID
3. **Easy Navigation**: File paths can be constructed based on entity type and ID
4. **Predictable Patterns**: Consistent naming and location conventions

## Anchor Documents

Anchor documents are the primary entities in FiberDB. Each anchor document:

1. **Storage Location**: Stored in `data/anchors/{anchor-type}/{id}.json`
2. **Contains**:
   - The entity's unique ID
   - All core fields of the entity
   - Optionally, encrypted fields (with special encoding)
   - No nested arrays of related items (those go in attached documents)

### Example Anchor Document

```json
{
  "id": "BP12345678",
  "firstName": "John",
  "lastName": "Doe",
  "customerClassification": "A",
  "region": "WEST",
  "industrySector": "Z002",
  "createdAt": "2023-05-15T14:32:18Z",
  "updatedAt": "2023-07-22T09:15:43Z"
}
```

### Anchor Document with Encrypted Fields

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
  "customerClassification": "A",
  "region": "WEST",
  "industrySector": "Z002",
  "createdAt": "2023-05-15T14:32:18Z",
  "updatedAt": "2023-07-22T09:15:43Z"
}
```

## Attached Documents

Attached documents contain related data for an anchor. Each attached document:

1. **Storage Location**: Stored in `data/attached/{anchor-id}/{attachment-type}.json`
2. **Contains**: An array of related items
3. **Format**: Always an array, even if there's only one item
4. **Structure**: Can have any internal structure suitable for the data type

### Example Attached Document: Addresses

```json
[
  {
    "id": "ADDR001",
    "street": "123 Main St",
    "city": "Springfield",
    "state": "CA",
    "postalCode": "12345",
    "addressType": "BILL",
    "isPrimary": true
  },
  {
    "id": "ADDR002",
    "street": "456 Oak Ave",
    "city": "Riverside",
    "state": "CA",
    "postalCode": "67890",
    "addressType": "INSTALL",
    "isPrimary": false
  }
]
```

### Example Attached Document: Contracts

```json
[
  {
    "contractId": "CT12345",
    "utilityType": "ELEC",
    "startDate": "2023-01-01",
    "endDate": "2024-01-01",
    "status": "ACTIVE",
    "tariffPlan": "RESIDENTIAL-STD",
    "monthlyAmount": 125.50
  },
  {
    "contractId": "CT67890",
    "utilityType": "GAS",
    "startDate": "2023-02-15",
    "endDate": "2024-02-15",
    "status": "ACTIVE",
    "tariffPlan": "RESIDENTIAL-ECO",
    "monthlyAmount": 85.75
  }
]
```

## Indexes

Indexes accelerate query performance by mapping field values to document IDs:

1. **Storage Location**: Stored in `data/_indexes/{anchor-type}/{field-name}.idx`
2. **Format**: JSON containing mapping from values to document IDs
3. **Types**:
   - **Hash Index**: Maps exact values to document IDs
   - **Range Index**: Additional information for numeric/date ranges
   - **Text Index**: Special format for text search optimization

### Example Hash Index (status.idx)

```json
{
  "active": ["BP12345", "BP67890", "BP24680"],
  "inactive": ["BP13579", "BP97531"]
}
```

### Example Range Index (createdAt.idx)

```json
{
  "_type": "range",
  "_sorted": [
    "2023-01-01T00:00:00Z",
    "2023-02-15T00:00:00Z",
    "2023-05-15T14:32:18Z"
  ],
  "2023-01-01T00:00:00Z": ["BP97531"],
  "2023-02-15T00:00:00Z": ["BP13579"],
  "2023-05-15T14:32:18Z": ["BP12345", "BP67890", "BP24680"]
}
```

## Data Storage Format

FiberDB uses standard JSON format for all storage:

1. **File Format**: UTF-8 encoded JSON
2. **Structure**:
   - Anchor documents are individual JSON objects
   - Attached documents are arrays of JSON objects
   - Indexes are specialized JSON structures

### Encoding Special Types

- **Dates**: Stored as ISO-8601 strings (e.g., "2023-05-15T14:32:18Z")
- **Binary Data**: Base64 encoded
- **Encrypted Fields**: Special object with `_encrypted` flag and `value` field

## File Naming Conventions

FiberDB follows specific naming conventions for files:

1. **Anchor Documents**: `{id}.json`
   - Examples: `BP12345678.json`, `ASSET001.json`

2. **Attached Documents**: `{attachment-type}.json`
   - Examples: `addresses.json`, `contracts.json`, `service-requests.json`

3. **Index Files**: `{field-name}.idx`
   - Examples: `status.idx`, `customerClassification.idx`, `createdAt.idx`

## Storage Operations

FiberDB provides several core operations for managing data storage:

### Saving Anchor Documents

The `saveAnchor` function creates or updates an anchor document:

```typescript
saveAnchor(
  anchorType: string,    // The type of anchor (e.g., "business-partner")
  id: string,            // The unique ID for this anchor
  data: Record<string, any>,  // The data to store
  options?: {
    secureFields?: string[],  // Array of field names to encrypt
    key?: string              // Encryption key
  }
): void
```

This function:
1. Ensures the storage directory exists
2. Encrypts any specified secure fields
3. Writes the document to disk
4. Updates any relevant indexes
5. Invalidates related cache entries

### Attaching Related Documents

The `attachToAnchor` function creates or updates an attached document:

```typescript
attachToAnchor(
  anchorId: string,      // The ID of the anchor to attach to
  attachmentType: string,  // The type of attachment (e.g., "addresses")
  data: any[],            // Array of items to attach
  options?: {
    secureFields?: string[],  // Array of field names to encrypt
    key?: string,             // Encryption key
    mode?: "replace" | "merge"  // Replace all or merge with existing
  }
): void
```

This function:
1. Ensures the attachment directory exists
2. Encrypts any specified secure fields
3. Either replaces the existing attachment or merges with it
4. Writes the attachment to disk
5. Invalidates related cache entries

### Reading Documents

The storage layer provides functions for reading documents:

```typescript
// Synchronous reading
loadJSON(filePath: string): any

// Asynchronous reading
async loadJSONAsync(filePath: string): Promise<any>
```

These functions:
1. Check if the file exists
2. Read the file content
3. Parse the JSON
4. Return the parsed object

### Directory Operations

The storage layer includes utilities for directory operations:

```typescript
// Check if file/directory exists
existsSync(path: string): boolean
async existsAsync(path: string): Promise<boolean>

// List directory contents
readdirSync(dirPath: string): string[]
async readdirAsync(dirPath: string): Promise<string[]>
```

### Transaction and Atomicity

The current version of FiberDB does not include transaction support. Each write operation:

1. Is atomic at the individual file level
2. Does not guarantee consistency across multiple files
3. Uses file system atomicity rules of the underlying OS

For applications requiring transactions, it is recommended to:
1. Implement optimistic concurrency control
2. Use version fields in documents
3. Implement application-level transaction logic