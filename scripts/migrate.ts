#!/usr/bin/env bun

/**
 * FiberDB Migration CLI
 * 
 * This script helps migrate from the file-based storage system
 * to the new enhanced storage engine with ACID compliance.
 */

import { runMigration } from '../src/migration/migrator';
import { existsSync } from 'fs';

interface CliOptions {
  oldPath?: string;
  newPath?: string;
  backup?: boolean;
  validate?: boolean;
  help?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--old-path':
      case '-o':
        options.oldPath = args[++i];
        break;
      case '--new-path':
      case '-n':
        options.newPath = args[++i];
        break;
      case '--no-backup':
        options.backup = false;
        break;
      case '--validate':
      case '-v':
        options.validate = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
FiberDB Migration CLI

USAGE:
  bun scripts/migrate.ts [OPTIONS]

OPTIONS:
  -o, --old-path <path>    Path to the old file-based data directory
                          (default: ./data)
  
  -n, --new-path <path>    Path for the new enhanced storage directory
                          (default: ./data_v2)
  
  --no-backup             Skip creating a backup of the old data
                          (default: create backup)
  
  -v, --validate          Only validate the migration without running it
  
  -h, --help              Show this help message

EXAMPLES:
  # Basic migration with default paths
  bun scripts/migrate.ts
  
  # Migrate specific directories
  bun scripts/migrate.ts --old-path ./old_data --new-path ./new_data
  
  # Migrate without creating backup
  bun scripts/migrate.ts --no-backup
  
  # Validate existing migration
  bun scripts/migrate.ts --validate --new-path ./migrated_data

NOTES:
  - Always create a backup before running migration in production
  - The migration process preserves all data and infers relationships
  - Legacy API remains fully compatible after migration
  - Enhanced features become available after migration
`);
}

async function validateMigration(newPath: string) {
  const { DataMigrator } = await import('../src/migration/migrator');
  
  if (!existsSync(newPath)) {
    console.error(`❌ Migration directory does not exist: ${newPath}`);
    process.exit(1);
  }
  
  console.log('🔍 Validating migration...');
  
  const migrator = new DataMigrator('', newPath);
  const validation = await migrator.validateMigration();
  
  if (validation.isValid) {
    console.log('✅ Migration validation passed!');
    console.log(`\nStatistics:`);
    console.log(`  Entities: ${validation.stats.entitiesCount}`);
    console.log(`  Relationships: ${validation.stats.totalEdges}`);
    console.log(`  Document types: ${validation.stats.documentTypes.join(', ') || 'None'}`);
  } else {
    console.log('❌ Migration validation failed!');
    console.log('\nIssues found:');
    validation.issues.forEach(issue => console.log(`  - ${issue}`));
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    printHelp();
    return;
  }
  
  const oldPath = options.oldPath || './data';
  const newPath = options.newPath || './data_v2';
  const createBackup = options.backup !== false;
  
  // Validation only mode
  if (options.validate) {
    await validateMigration(newPath);
    return;
  }
  
  // Pre-migration checks
  if (!existsSync(oldPath)) {
    console.error(`❌ Old data directory does not exist: ${oldPath}`);
    console.error('   Please ensure the path is correct or use --old-path to specify it.');
    process.exit(1);
  }
  
  if (existsSync(newPath)) {
    console.warn(`⚠️  New data directory already exists: ${newPath}`);
    console.warn('   Migration will overwrite existing data.');
    
    // Simple confirmation prompt
    console.log('\nPress Ctrl+C to cancel, or Enter to continue...');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
  }
  
  console.log('🚀 Starting FiberDB migration...\n');
  console.log(`Source: ${oldPath}`);
  console.log(`Target: ${newPath}`);
  console.log(`Backup: ${createBackup ? 'Yes' : 'No'}\n`);
  
  try {
    await runMigration(oldPath, newPath, createBackup);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Update your application configuration to use the new data path');
    console.log('2. Set FIBERDB_ENGINE=custom in your environment variables');
    console.log('3. Test your application with the migrated data');
    console.log('4. Consider using the new enhanced API features');
    console.log('\nRefer to the documentation for more information about new features.');
    
  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    console.error('\nPlease check the error message above and try again.');
    console.error('If the issue persists, please check the documentation or file an issue.');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Migration cancelled by user');
  process.exit(0);
});

// Run the CLI
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});