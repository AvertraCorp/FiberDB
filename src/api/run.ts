/**
 * Run Server Script - Standalone entry point for the API server
 */
import startServer from './server';

// Start the server
const server = startServer();

console.log('FiberDB API server is running. Press Ctrl+C to stop.');