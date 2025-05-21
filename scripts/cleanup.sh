#!/bin/bash
# Clean up old files that have been moved to the src structure

# Only execute if src directory is properly set up
if [ ! -d "/Users/hasanalnatour/Downloads/fiberDB/src/core" ]; then
  echo "Error: src/core directory doesn't exist. Aborting cleanup."
  exit 1
fi

# Remove old core files
echo "Removing old core files..."
rm -rf /Users/hasanalnatour/Downloads/fiberDB/core

# Remove old test files
echo "Removing old test files..."
rm -f /Users/hasanalnatour/Downloads/fiberDB/test-cache-performance.ts
rm -f /Users/hasanalnatour/Downloads/fiberDB/test-indexing.ts
rm -f /Users/hasanalnatour/Downloads/fiberDB/test-parallel-performance.ts

# Remove old server and index files
echo "Removing old server files..."
rm -f /Users/hasanalnatour/Downloads/fiberDB/server.ts
rm -f /Users/hasanalnatour/Downloads/fiberDB/index.ts

# Remove old OpenAPI spec file
echo "Removing old OpenAPI spec..."
rm -f /Users/hasanalnatour/Downloads/fiberDB/openapi.yaml

echo "Cleanup complete!"