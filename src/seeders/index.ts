/**
 * FiberDB Data Seeders
 * 
 * Main entry point for all data seeders
 */

import { seedAllSAPUtilitiesData } from './sap-utilities';

// Export all seeders
export {
  seedAllSAPUtilitiesData
};

// Function to seed all data
export async function seedAll(options: {
  clearExisting?: boolean;
  sapUtilitiesBusinessPartners?: number;
}) {
  const {
    clearExisting = false,
    sapUtilitiesBusinessPartners = 50,
  } = options;

  console.log('=== Starting FiberDB Data Seeder ===');
  
  // Seed SAP Utilities data
  await seedAllSAPUtilitiesData({
    businessPartnerCount: sapUtilitiesBusinessPartners,
    clearExisting,
  });
  
  // TODO: Add other domain seeders as they are implemented
  
  console.log('=== All FiberDB Data Seeding Complete ===');
}

// If this module is run directly
if (import.meta.main) {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let clearExisting = false;
  let sapUtilitiesBusinessPartners = 50;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--clear') {
      clearExisting = true;
    } else if (args[i] === '--sap-bp-count' && args[i+1]) {
      sapUtilitiesBusinessPartners = parseInt(args[i+1], 10);
      i++;
    }
  }
  
  // Run the seeder
  seedAll({
    clearExisting,
    sapUtilitiesBusinessPartners,
  }).catch(err => {
    console.error('Error seeding data:', err);
    process.exit(1);
  });
}