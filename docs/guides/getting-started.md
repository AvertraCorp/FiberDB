# Getting Started with FiberDB

This guide will help you get started with FiberDB, from installation to running your first queries.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Starting the Server](#starting-the-server)
4. [Seeding Test Data](#seeding-test-data)
5. [Running Your First Query](#running-your-first-query)
6. [Exploring the API](#exploring-the-api)
7. [Next Steps](#next-steps)
8. [Docker Deployment](#docker-deployment)

## Prerequisites

Before getting started with FiberDB, ensure you have the following:

- [Bun](https://bun.sh) JavaScript runtime installed (required for native installation)
- OR Docker and Docker Compose for containerized deployment
- Basic familiarity with JavaScript/TypeScript
- 200MB+ of free disk space for the database and sample data

## Installation

### Option 1: Native Installation

Clone the FiberDB repository to get started:

```bash
# Clone the repository
git clone https://github.com/your-username/fiberdb.git
cd fiberdb

# Install dependencies
bun install
```

### Option 2: Docker Installation

Clone the repository and use Docker Compose:

```bash
# Clone the repository
git clone https://github.com/your-username/fiberdb.git
cd fiberdb

# Build and start the Docker container
docker-compose up -d
```

## Starting the Server

### Option 1: Using Bun

FiberDB includes a built-in server that provides an HTTP API for querying the database:

```bash
# Start the FiberDB server
bun run start
```

By default, the server runs on port 4000. You should see output similar to:

```
FiberDB server running at http://localhost:4000
```

### Option 2: Using Docker

If you're using Docker, the server should already be running. Check the logs with:

```bash
docker-compose logs -f
```

By default, the Docker container exposes the server on port 3000:

```
FiberDB server running at http://localhost:3000
```

For more details on Docker deployment, see [Docker Deployment Guide](./docker-deployment.md).

The server provides several endpoints:
- `POST /query` - Execute queries against the database
- `GET /cache` - View cache statistics
- `DELETE /cache` - Clear caches
- `GET /health` - Check server health

## Seeding Test Data

FiberDB comes with data seeders to generate realistic sample data:

### Option 1: Using Bun

```bash
# Generate default sample data
bun run seed

# Generate SAP Utilities data (50 business partners)
bun run seed:sap

# Generate a larger SAP Utilities dataset (200 business partners)
bun run seed:sap-large
```

### Option 2: Using Docker

```bash
# Generate default sample data
docker exec fiberdb bun run seed

# Generate SAP Utilities data (50 business partners)
docker exec fiberdb bun run seed:sap

# Generate a larger SAP Utilities dataset (200 business partners)
docker exec fiberdb bun run seed:sap-large
```

The seeded data includes:
- Business partners with realistic attributes
- Addresses (billing, installation)
- Contracts for various utility types
- Meter installations
- Bank accounts
- Contact information

You can verify the data was created by checking the `data/` directory:

```bash
ls -la data/anchors/business-partner
ls -la data/attached
```

## Running Your First Query

Let's start by running a simple query to retrieve business partners. You can use curl from the command line:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{
    "primary": "business-partner",
    "include": ["id", "firstName", "lastName", "customerClassification"]
  }'
```

This should return a JSON array of business partners with the specified fields.

### Finding Specific Business Partners

To find business partners matching specific criteria, add a filter:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{
    "primary": "business-partner",
    "filter": { "customerClassification": "A" },
    "include": ["id", "firstName", "lastName"]
  }'
```

### Including Related Data

To include related data like addresses or contracts:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{
    "primary": "business-partner",
    "filter": { "customerClassification": "A" },
    "include": ["id", "firstName", "lastName", "addresses", "contracts"]
  }'
```

### Filtering on Related Data

To find business partners based on related data, use the `where` parameter:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{
    "primary": "business-partner",
    "include": ["id", "firstName", "lastName", "contracts"],
    "where": {
      "contracts.status": { "eq": "ACTIVE" },
      "contracts.utilityType": { "eq": "ELEC" }
    }
  }'
```

## Exploring the API

You can also use the API from JavaScript/TypeScript code:

```javascript
// example.js
import fetch from 'node-fetch';

async function queryFiberDB() {
  const response = await fetch('http://localhost:4000/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      primary: "business-partner",
      filter: { customerClassification: "A" },
      include: ["id", "firstName", "lastName", "addresses"]
    })
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

queryFiberDB();
```

Run this example with:

```bash
bun run example.js
```

## Next Steps

Now that you have FiberDB running with sample data, here are some next steps:

### Explore Advanced Queries

- Try different filter operators (`eq`, `ne`, `gt`, `lt`, `contains`, `in`)
- Combine filters on multiple fields
- Use nested filtering with the `where` clause

### Performance Optimization

Experiment with performance controls:

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -H "X-Use-Parallel: true" \
  -H "X-Include-Performance-Metrics: true" \
  -d '{
    "primary": "business-partner"
  }'
```

### Run Benchmarks

FiberDB includes performance benchmarks to evaluate different optimization techniques:

```bash
# Using Bun
# Run all benchmarks
bun run benchmark

# Run specific benchmarks
bun run benchmark:cache
bun run benchmark:parallel
bun run benchmark:indexing

# Using Docker
# Run all benchmarks
docker exec fiberdb bun run benchmark

# Run specific benchmarks
docker exec fiberdb bun run benchmark:cache
docker exec fiberdb bun run benchmark:parallel
docker exec fiberdb bun run benchmark:indexing
```

### Run Example Queries

Explore the comprehensive query examples:

```bash
# Using Bun
bun run examples

# Using Docker
docker exec fiberdb bun run examples
```

These examples demonstrate all available query types and optimization techniques.

### Explore the Documentation

Check out other guides and documentation:
- [Query System Documentation](../query-system/README.md)
- [API Documentation](../api/README.md)
- [Architecture Documentation](../architecture/README.md)
- [Docker Deployment Guide](./docker-deployment.md)

## Docker Deployment

For detailed information about deploying FiberDB using Docker, see the [Docker Deployment Guide](./docker-deployment.md).

The Docker deployment provides several benefits:
- Consistent environment across development, testing, and production
- Simple installation process without needing to install Bun directly
- Easy configuration through Docker Compose
- Portable deployment across different operating systems
- Simplified scaling and management

Refer to the Docker Deployment Guide for advanced configuration options, troubleshooting, and performance optimization tips.