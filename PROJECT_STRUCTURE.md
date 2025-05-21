# FiberDB Project Structure

This document outlines the organization of the FiberDB codebase.

## Directory Structure

```
fiberDB/
├── src/                      # Source code directory
│   ├── core/                 # Core database functionality
│   │   ├── storage/          # Storage and data persistence
│   │   ├── query/            # Query engine and processors
│   │   ├── crypto/           # Encryption and security
│   │   └── indexing/         # Indexing subsystem
│   ├── api/                  # API and server endpoints
│   ├── utils/                # Utility functions and helpers
│   ├── types/                # TypeScript type definitions
│   └── config.ts             # Configuration settings
├── tests/                    # Test suites
│   ├── unit/                 # Unit tests
│   └── integration/          # Integration tests
├── benchmarks/               # Performance benchmarks and tests
├── scripts/                  # Build and maintenance scripts
├── docs/                     # Documentation
│   ├── api/                  # API documentation
│   └── guides/               # User guides
└── data/                     # Data storage (excluded from git)
    ├── anchors/              # Anchor documents
    └── attached/             # Attached documents
```

## Module Organization

### Core Modules

- **Storage Module** (`src/core/storage/`): Handles data persistence, file operations, and directory management
- **Query Module** (`src/core/query/`): Contains query engines, filters, and data retrieval logic
- **Crypto Module** (`src/core/crypto/`): Provides encryption and decryption utilities
- **Indexing Module** (`src/core/indexing/`): Manages index creation, maintenance, and lookup

### Utility Modules

- **Cache** (`src/utils/cache.ts`): LRU and TTL cache implementations
- **Performance** (`src/utils/performance.ts`): Performance tracking and metrics

### API Layer

- **Server** (`src/api/server.ts`): HTTP server implementation
- **Endpoints** (`src/api/endpoints/`): API endpoints and route handlers

### Test and Performance

- **Unit Tests** (`tests/unit/`): Tests for individual components
- **Integration Tests** (`tests/integration/`): Tests for integrated components
- **Benchmarks** (`benchmarks/`): Performance benchmarking and comparison tools

## Configuration

- **Environment Variables**: Configured in `.env` file
- **Database Settings**: Configured in `src/config.ts`