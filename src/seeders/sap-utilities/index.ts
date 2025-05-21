/**
 * SAP Utilities Data Seeder
 * 
 * This is the main entry point for seeding SAP Utilities data.
 * It provides functions to seed different types of data:
 * - Business Partners
 * - Contracts
 * - Meters
 * - Readings
 * - Billing Documents
 * - Payments
 */

import { seedBusinessPartners } from './business-partner';
import fs from 'fs';
import path from 'path';

// Clear existing data for a clean seed
function clearExistingData() {
  const dataDir = path.join(process.cwd(), 'data');
  if (fs.existsSync(dataDir)) {
    console.log('Clearing existing data...');
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('Data directory cleared');
  }
}

// Seed all SAP Utilities data
export async function seedAllSAPUtilitiesData(options: {
  businessPartnerCount?: number;
  clearExisting?: boolean;
}) {
  const {
    businessPartnerCount = 50,
    clearExisting = false,
  } = options;

  console.log('=== Starting SAP Utilities Data Seeder ===');
  
  // Clear existing data if requested
  if (clearExisting) {
    clearExistingData();
  }
  
  // Seed business partners
  await seedBusinessPartners(businessPartnerCount);
  
  // TODO: Add other seeders as they are implemented
  // await seedContracts();
  // await seedMeters();
  // await seedReadings();
  // await seedBillingDocuments();
  // await seedPayments();

  console.log('=== SAP Utilities Data Seeding Complete ===');
}

// If this module is run directly
if (import.meta.main) {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let businessPartnerCount = 50; // Default
  let clearExisting = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i+1]) {
      businessPartnerCount = parseInt(args[i+1], 10);
      i++;
    } else if (args[i] === '--clear') {
      clearExisting = true;
    }
  }
  
  // Run the seeder
  seedAllSAPUtilitiesData({
    businessPartnerCount,
    clearExisting,
  }).catch(err => {
    console.error('Error seeding data:', err);
    process.exit(1);
  });
}

export { seedBusinessPartners };