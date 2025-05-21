# FiberDB Advanced Filtering

This document provides detailed information about FiberDB's advanced filtering capabilities, showing how to construct powerful queries with complex conditions.

## Table of Contents

1. [Filter Syntax](#filter-syntax)
2. [Primary vs. Attachment Filters](#primary-vs-attachment-filters)
3. [Filter Operators](#filter-operators)
4. [Combining Filters](#combining-filters)
5. [Performance Considerations](#performance-considerations)
6. [Filter Examples](#filter-examples)

## Filter Syntax

FiberDB supports two main methods for specifying filters:

### Simple Equality Filters

For basic exact matching, use direct key-value pairs:

```javascript
filter: {
  status: "active",
  customerClassification: "A"
}
```

This matches documents where `status` equals exactly "active" AND `customerClassification` equals exactly "A".

### Operator-Based Filters

For more complex conditions, use the operator object syntax:

```javascript
filter: {
  status: { eq: "active" },
  priority: { gt: 2 }
}
```

This matches documents where `status` equals "active" AND `priority` is greater than 2.

## Primary vs. Attachment Filters

FiberDB distinguishes between two types of filters:

### Primary Filters

Primary filters (`filter` parameter) apply to fields in the anchor document:

```javascript
{
  primary: "business-partner",
  filter: { 
    status: "active",
    customerClassification: "A" 
  }
}
```

### Attachment Filters

Attachment filters (`where` parameter) apply to fields in attached documents using dot notation:

```javascript
{
  primary: "business-partner",
  where: { 
    "contracts.status": { eq: "ACTIVE" },
    "addresses.city": { contains: "Springfield" }
  }
}
```

## Filter Operators

FiberDB supports the following filter operators:

### Equality Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal to | `{ eq: "active" }` |
| `ne` | Not equal to | `{ ne: "inactive" }` |

### Comparison Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `gt` | Greater than | `{ gt: 100 }` |
| `lt` | Less than | `{ lt: 200 }` |

### Text Search Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `contains` | Text contains (case-insensitive) | `{ contains: "smith" }` |

### Array Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Value is in array | `{ in: ["WEST", "SOUTH"] }` |

### Custom Data Types

Operators work with various data types:

#### Dates

```javascript
// Greater than a specific date
"createdAt": { gt: "2023-01-01T00:00:00Z" }
```

#### Numbers

```javascript
// Between two values (using both gt and lt)
"amount": { gt: 100, lt: 500 }
```

#### Strings

```javascript
// Not equal to a specific string
"status": { ne: "cancelled" }
```

#### Boolean

```javascript
// Exact match (using simple equality)
"isActive": true
```

## Combining Filters

FiberDB combines all filter conditions using AND logic:

```javascript
filter: {
  status: "active",
  customerClassification: "A",
  region: { in: ["WEST", "SOUTH"] }
}
```

This matches records where:
- `status` equals "active" AND
- `customerClassification` equals "A" AND
- `region` is either "WEST" or "SOUTH"

### Combining Primary and Attachment Filters

Primary and attachment filters can be used together:

```javascript
{
  primary: "business-partner",
  filter: { 
    status: "active" 
  },
  where: { 
    "contracts.status": { eq: "ACTIVE" },
    "addresses.city": { contains: "Springfield" }
  }
}
```

This matches business partners where:
- The partner's `status` is "active" AND
- They have at least one contract with status "ACTIVE" AND
- They have at least one address in a city containing "Springfield"

## Performance Considerations

Filter performance varies based on several factors:

### Filter Types

1. **ID-based queries**: Fastest (direct file access)
2. **Index-backed filters**: Very fast (uses index lookup)
3. **Primary field filters**: Fast (scans anchor documents only)
4. **Attachment field filters**: Slower (requires loading attachments)

### Optimizing Filter Performance

1. **Use indexes for common filter fields**:
   - Indexes are automatically created for fields commonly used in filters
   - Queries using these fields will be much faster

2. **Narrow down results with primary filters first**:
   - Primary filters are applied before attachment filters
   - Reducing the number of records with primary filters improves performance

3. **Be specific with field inclusion**:
   - Only include the attachments you need
   - Reduces the amount of data loaded and processed

4. **Use cache effectively**:
   - Repeated identical queries use cached results
   - Avoid `skipCache: true` unless fresh data is required

## Filter Examples

### Basic Customer Filtering

Find active business partners with classification "A":

```javascript
const result = await query({
  primary: "business-partner",
  filter: { 
    status: "active",
    customerClassification: "A" 
  }
});
```

### Finding Customers by Contract Type

Find business partners with active electricity contracts:

```javascript
const result = await query({
  primary: "business-partner",
  include: ["firstName", "lastName", "contracts"],
  where: {
    "contracts.status": { eq: "ACTIVE" },
    "contracts.utilityType": { eq: "ELEC" }
  }
});
```

### Geographic Search

Find business partners in cities containing "Springfield":

```javascript
const result = await query({
  primary: "business-partner",
  include: ["firstName", "lastName", "addresses"],
  where: {
    "addresses.city": { contains: "Springfield" }
  }
});
```

### Date Range Query

Find business partners created in the first quarter of 2023:

```javascript
const result = await query({
  primary: "business-partner",
  filter: {
    createdAt: { 
      gt: "2023-01-01T00:00:00Z",
      lt: "2023-04-01T00:00:00Z"
    }
  }
});
```

### Combined Complex Query

Find active high-value business partners with smart meters:

```javascript
const result = await query({
  primary: "business-partner",
  filter: { 
    status: "active",
    customerClassification: { in: ["A", "B"] },
    annualRevenue: { gt: 100000 }
  },
  include: ["firstName", "lastName", "contracts", "meters"],
  where: {
    "contracts.status": { eq: "ACTIVE" },
    "meters.isSmartMeter": true
  }
});
```