/**
 * Seeder Runner Script
 * 
 * This script is used to run the seeders from the command line.
 * 
 * Usage:
 *   bun run src/seeders/run-seeder.ts [options]
 * 
 * Options:
 *   --clear                  Clear existing data before seeding
 *   --sap-bp-count <number>  Number of SAP Utilities business partners to generate
 *   --sap-only               Only generate SAP Utilities data
 */

import { seedAll, seedAllSAPUtilitiesData } from './index';

// Parse command-line arguments
const args = process.argv.slice(2);
let clearExisting = false;
let sapUtilitiesBusinessPartners = 50;
let sapOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--clear') {
    clearExisting = true;
  } else if (args[i] === '--sap-bp-count' && args[i+1]) {
    sapUtilitiesBusinessPartners = parseInt(args[i+1], 10);
    i++;
  } else if (args[i] === '--sap-only') {
    sapOnly = true;
  }
}

// Run the appropriate seeder
if (sapOnly) {
  console.log(`Running SAP Utilities seeder with ${sapUtilitiesBusinessPartners} business partners...`);
  seedAllSAPUtilitiesData({
    businessPartnerCount: sapUtilitiesBusinessPartners,
    clearExisting,
  }).catch(err => {
    console.error('Error seeding SAP Utilities data:', err);
    process.exit(1);
  });
} else {
  console.log(`Running all seeders...`);
  seedAll({
    clearExisting,
    sapUtilitiesBusinessPartners,
  }).catch(err => {
    console.error('Error seeding data:', err);
    process.exit(1);
  });
}