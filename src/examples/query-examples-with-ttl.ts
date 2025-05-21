/**
 * Updated query examples with TTL support
 * 
 * This example demonstrates the skipTTL option for retrieving historical data
 */
import fs from 'fs';
import path from 'path';
import { query } from '../core/query';
import config from '../config';

/**
 * TTL Override Example
 */
async function ttlExamples() {
  console.log('=== TTL Override Examples ===');
  
  // First show that some records might be filtered due to TTL
  const bpId = 'BP00370714';
  const anchorPath = path.join(config.storage.baseDir, 'anchors', 'business-partner', `${bpId}.json`);
  
  if (fs.existsSync(anchorPath)) {
    const data = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
    console.log('Record dates:');
    console.log('- createdAt:', data.createdAt);
    
    // Calculate if it would be filtered by TTL
    const recordDate = new Date(data.created_at || data.createdAt || Date.now());
    const ttlCutoff = new Date(Date.now() - config.storage.ttlDays * 24 * 60 * 60 * 1000);
    console.log('Record date:', recordDate);
    console.log('TTL cutoff:', ttlCutoff);
    console.log('Would be filtered by TTL?', recordDate < ttlCutoff);
    
    // Regular query (with TTL)
    console.log('\nRunning standard query (with TTL filtering):');
    const standardResult = await query({
      primary: 'business-partner',
      id: bpId,
      include: ['id', 'organizationName', 'addresses']
    });
    console.log('Standard query result count:', standardResult.length);
    
    // Query with TTL override
    console.log('\nRunning query with skipTTL option:');
    const historicalResult = await query({
      primary: 'business-partner',
      id: bpId,
      include: ['id', 'organizationName', 'addresses'],
      skipTTL: true,
      includePerformanceMetrics: true  // Add metrics to see details
    });
    console.log('Historical query result count:', historicalResult.length);
    
    // Show performance metrics
    if (historicalResult.length > 0 && historicalResult[0].__metrics) {
      console.log('\nPerformance metrics:');
      console.log('- recordsStats:', historicalResult[0].__metrics.details?.recordsStats);
    } else {
      console.log('\nDirect debug check:');
      
      // Try sync query directly with debugging
      const { runStructuredQuery } = await import('../core/query');
      
      console.log('Running direct sync query with detailed logging:');
      // Direct run with full debugging
      const debugResult = runStructuredQuery({
        primary: 'business-partner',
        id: bpId,
        skipTTL: true,
        includePerformanceMetrics: true
      });
      
      console.log('Debug result length:', debugResult.length);
      
      if (debugResult.length > 0 && debugResult[0].__metrics) {
        console.log('Debug metrics:', debugResult[0].__metrics.details);
      } else {
        // Try reading the file directly as a final check
        const directData = fs.existsSync(anchorPath) ? 
          JSON.parse(fs.readFileSync(anchorPath, 'utf8')) : null;
        
        console.log('Direct file read result:', directData ? 'success' : 'failed');
        if (directData) {
          console.log('Direct data id:', directData.id);
        }
      }
    }
    
    if (historicalResult.length > 0 && historicalResult[0].addresses) {
      console.log('Historical address count:', historicalResult[0].addresses.length);
      console.log('First address:', historicalResult[0].addresses[0]);
    }
  } else {
    console.log('Sample data file not found');
  }
  
  // API Example
  console.log('\nAPI Usage Example for skipTTL:');
  console.log(`
  curl -X POST http://localhost:${config.server.port}/query \\
    -H "Content-Type: application/json" \\
    -H "X-Skip-TTL: true" \\
    -d '{
      "primary": "business-partner",
      "id": "BP00370714",
      "include": ["id", "organizationName", "addresses"]
    }'
  `);
}

// Execute the examples
if (import.meta.main) {
  ttlExamples()
    .then(() => console.log('\nExamples completed'))
    .catch(err => console.error('Error:', err));
}