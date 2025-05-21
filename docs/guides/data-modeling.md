# Data Modeling with FiberDB

This guide explains how to model your data effectively in FiberDB, leveraging the anchor-attachment model to create flexible, efficient data structures.

## Table of Contents

1. [Understanding the Anchor-Attachment Model](#understanding-the-anchor-attachment-model)
2. [Designing Anchor Entities](#designing-anchor-entities)
3. [Planning Attachments](#planning-attachments)
4. [Building Relationships](#building-relationships)
5. [Securing Sensitive Data](#securing-sensitive-data)
6. [Data Modeling Best Practices](#data-modeling-best-practices)
7. [Example: Modeling a Customer Database](#example-modeling-a-customer-database)

## Understanding the Anchor-Attachment Model

FiberDB uses a two-tier data model:

### Anchor Documents

- **Primary entities** in your data model
- **Core attributes** that define the entity
- **Reference point** for all related data
- Stored in `data/anchors/{anchor-type}/{id}.json`

### Attached Documents

- **Related data** connected to anchors
- Always stored as **arrays of objects**
- Can have different schemas per attachment type
- Stored in `data/attached/{anchor-id}/{attachment-type}.json`

This model provides several advantages:

1. **Flexible Schema**: Add new attachments without changing the anchor structure
2. **Selective Loading**: Only load the attachments you need
3. **Logical Organization**: Data is organized based on logical relationships
4. **Performance Optimization**: Query only the data you need

## Designing Anchor Entities

When designing anchor entities, follow these guidelines:

### Identify Core Entities

Determine which entities should be anchors:
- Independent real-world objects (customers, products, orders)
- Entities that multiple other entities relate to
- Items that need to be queried directly

### Select Anchor Fields

Include in the anchor document:
- Unique identifier
- Essential attributes that define the entity
- Fields used frequently in queries
- Status and classification information
- Timestamps (created, updated)

### Avoid in Anchor Documents

- Large arrays of related items (use attachments instead)
- Binary data (use specialized attachments)
- Rarely accessed information
- Highly volatile data that changes frequently

### Example Anchor Document

```json
{
  "id": "CUST12345",
  "firstName": "John",
  "lastName": "Doe",
  "customerType": "RESIDENTIAL",
  "status": "ACTIVE",
  "createdAt": "2023-01-15T10:30:00Z",
  "updatedAt": "2023-06-22T14:45:00Z"
}
```

## Planning Attachments

Attachments should be designed carefully to balance flexibility and performance:

### When to Create Attachments

Create separate attachments for:
- Groups of related attributes (addresses, contact methods)
- One-to-many relationships (orders, service requests)
- Data that changes at different frequencies
- Information accessed in specific scenarios
- Large collections of items

### Attachment Structure

Each attachment is an array of objects, even if there's only one item:

```json
[
  {
    "id": "ADDR001",
    "type": "BILLING",
    "street": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62701"
  },
  {
    "id": "ADDR002",
    "type": "SHIPPING",
    "street": "456 Oak Ave",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62702"
  }
]
```

### Common Attachment Types

- **Addresses**: Multiple address types (billing, shipping, installation)
- **Contact Information**: Email addresses, phone numbers
- **Financial Data**: Payment methods, bank accounts
- **Transactions**: Orders, payments, service requests
- **Preferences**: User settings, notification preferences
- **Audit Information**: Activity logs, change history

## Building Relationships

FiberDB supports several types of relationships:

### One-to-Many Relationships

Connect one anchor to multiple related items using attachments:

```javascript
// Create a customer
saveAnchor("customer", "CUST12345", {
  id: "CUST12345",
  firstName: "John",
  lastName: "Doe",
  // ... other fields
});

// Add multiple orders as an attachment
attachToAnchor("CUST12345", "orders", [
  {
    orderId: "ORD001",
    date: "2023-05-15",
    total: 125.50,
    status: "DELIVERED"
  },
  {
    orderId: "ORD002",
    date: "2023-06-20",
    total: 85.75,
    status: "PROCESSING"
  }
]);
```

### Many-to-Many Relationships

For many-to-many relationships, you have two options:

#### Option 1: Duplicate References (Simpler)

Store references on both sides:

```javascript
// Option 1: Store product references in orders
attachToAnchor("CUST12345", "orders", [
  {
    orderId: "ORD001",
    products: ["PROD123", "PROD456", "PROD789"],
    // ... other fields
  }
]);

// And store order references in products
attachToAnchor("PROD123", "orders", [
  {
    orderId: "ORD001",
    customerId: "CUST12345",
    // ... other fields
  }
]);
```

#### Option 2: Junction Collection (More Normalized)

Create a third anchor type that connects the two entities:

```javascript
// Create order-product relationships
saveAnchor("order-product", "OP12345", {
  id: "OP12345",
  orderId: "ORD001",
  productId: "PROD123",
  quantity: 2,
  price: 29.99
});
```

### Cross-Entity Queries

Query across relationships using the `where` parameter:

```javascript
// Find customers with specific product orders
const result = await query({
  primary: "customer",
  include: ["firstName", "lastName", "orders"],
  where: {
    "orders.products": { contains: "PROD123" }
  }
});
```

## Securing Sensitive Data

FiberDB provides field-level encryption for sensitive data:

### Encrypting Fields in Anchors

```javascript
saveAnchor("customer", "CUST12345", {
  id: "CUST12345",
  firstName: "John",
  lastName: "Doe",
  ssn: "123-45-6789",
  dateOfBirth: "1985-05-15"
}, { 
  secureFields: ["ssn", "dateOfBirth"], 
  key: "encryption-key" 
});
```

### Encrypting Fields in Attachments

```javascript
attachToAnchor("CUST12345", "payment-methods", [
  {
    type: "CREDIT_CARD",
    cardNumber: "4111111111111111",
    expiryDate: "12/25",
    nameOnCard: "John Doe"
  }
], { 
  secureFields: ["cardNumber"], 
  key: "encryption-key" 
});
```

### Querying Encrypted Data

```javascript
const result = await query({
  primary: "customer",
  include: ["firstName", "lastName", "ssn", "dateOfBirth"],
  decryptionKey: "encryption-key"
});
```

Without the decryption key, encrypted fields remain encrypted in the response.

## Data Modeling Best Practices

Follow these best practices for effective data modeling in FiberDB:

### Performance-Oriented Design

1. **Keep anchor documents small**: Include only essential fields
2. **Group related fields in attachments**: Create logical groupings
3. **Consider query patterns**: Fields frequently queried together should be in the same document
4. **Use indexing strategically**: Common filter fields should be in anchor documents
5. **Split large collections**: Break very large collections into meaningful subdivisions

### Maintainability and Evolution

1. **Establish consistent naming conventions**: Both for anchor types and attachment types
2. **Document your data model**: Create a schema documentation for your system
3. **Plan for schema evolution**: Design with future changes in mind
4. **Create migration strategies**: Develop approaches for schema changes
5. **Consider versioning**: Add version fields to track schema versions

### Security Best Practices

1. **Encrypt all sensitive data**: Use field-level encryption for PII
2. **Keep keys separate**: Never store encryption keys with the data
3. **Classify data sensitivity**: Document which fields contain sensitive information
4. **Layer security controls**: Combine encryption with API-level access controls
5. **Implement key rotation**: Design a process for changing encryption keys

## Example: Modeling a Customer Database

Let's walk through modeling a customer database for a utility company:

### 1. Define Anchor Types

```
- business-partner (customers, prospects, vendors)
- asset (equipment, meters)
- service-location (properties, installation sites)
- service-order (work orders, maintenance requests)
```

### 2. Design Business Partner Anchor

```json
{
  "id": "BP12345678",
  "partnerType": "CUSTOMER",
  "firstName": "John",
  "lastName": "Doe",
  "customerClassification": "RESIDENTIAL",
  "status": "ACTIVE",
  "primaryEmail": "john.doe@example.com",
  "primaryPhone": "555-123-4567",
  "createdAt": "2023-01-15T10:30:00Z",
  "updatedAt": "2023-06-22T14:45:00Z"
}
```

### 3. Plan Attachments

For business partners:
- `addresses.json`: Multiple address types
- `contact-info.json`: Additional contact methods
- `bank-accounts.json`: Payment information
- `contracts.json`: Service agreements
- `service-requests.json`: Customer support cases
- `preferences.json`: Communication preferences
- `notes.json`: Customer relationship notes

### 4. Sample Code to Create the Model

```javascript
// Create the business partner
saveAnchor("business-partner", "BP12345678", {
  id: "BP12345678",
  partnerType: "CUSTOMER",
  firstName: "John",
  lastName: "Doe",
  customerClassification: "RESIDENTIAL",
  status: "ACTIVE",
  primaryEmail: "john.doe@example.com",
  primaryPhone: "555-123-4567",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, { 
  secureFields: ["firstName", "lastName"], 
  key: "encryption-key" 
});

// Attach addresses
attachToAnchor("BP12345678", "addresses", [
  {
    id: "ADDR001",
    type: "BILLING",
    street: "123 Main St",
    city: "Springfield",
    state: "IL",
    postalCode: "62701",
    isPrimary: true
  },
  {
    id: "ADDR002",
    type: "SERVICE",
    street: "456 Oak Ave",
    city: "Springfield",
    state: "IL",
    postalCode: "62702",
    isPrimary: false
  }
]);

// Attach contracts
attachToAnchor("BP12345678", "contracts", [
  {
    contractId: "CT001",
    serviceType: "ELECTRICITY",
    plan: "RESIDENTIAL-STANDARD",
    startDate: "2023-01-20",
    status: "ACTIVE",
    monthlyAmount: 125.50,
    serviceLocationId: "SL001"
  },
  {
    contractId: "CT002",
    serviceType: "WATER",
    plan: "RESIDENTIAL-BASIC",
    startDate: "2023-01-20",
    status: "ACTIVE",
    monthlyAmount: 45.75,
    serviceLocationId: "SL001"
  }
]);

// Attach bank accounts with encryption
attachToAnchor("BP12345678", "bank-accounts", [
  {
    id: "BA001",
    bankName: "First National Bank",
    accountType: "CHECKING",
    accountNumber: "123456789",
    routingNumber: "987654321",
    isDefault: true
  }
], { 
  secureFields: ["accountNumber", "routingNumber"], 
  key: "encryption-key" 
});
```

### 5. Query Examples for the Model

```javascript
// Find all active residential customers
const residentialCustomers = await query({
  primary: "business-partner",
  filter: { 
    partnerType: "CUSTOMER",
    customerClassification: "RESIDENTIAL",
    status: "ACTIVE"
  },
  include: ["id", "firstName", "lastName", "primaryEmail"]
});

// Find customers with electricity contracts
const electricityCustomers = await query({
  primary: "business-partner",
  include: ["id", "firstName", "lastName", "contracts"],
  where: {
    "contracts.serviceType": { eq: "ELECTRICITY" },
    "contracts.status": { eq: "ACTIVE" }
  }
});

// Find customers by service location city
const springfieldCustomers = await query({
  primary: "business-partner",
  include: ["id", "firstName", "lastName", "addresses"],
  where: {
    "addresses.city": { eq: "Springfield" }
  }
});
```

This approach provides a flexible, efficient model for the customer database that can be easily extended as requirements evolve.