#!/bin/bash
# Cleanup script to remove scattered test files

# Move to the project root
cd "$(dirname "$0")"

# Find all scattered test files and remove them
echo "Removing scattered test files..."
find ./src -maxdepth 1 -type f -name "test-*.ts" -print -delete

echo "Test files cleanup complete!"