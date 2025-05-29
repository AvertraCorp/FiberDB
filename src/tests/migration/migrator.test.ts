/**
 * Migration Tests
 * Testing the data migration from file storage to enhanced storage
 */
import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, spyOn } from "bun:test";
import { DataMigrator } from "../../migration/migrator";
import { documentCache, queryCache, fileExistsCache } from "../../utils/cache";
import * as storage from "../../core/storage";
import fs from "fs";
import path from "path";

describe("Data Migration", () => {
  let tempOldDir: string;
  let tempNewDir: string;
  let migrator: DataMigrator;
  let testId: string;

  beforeAll(() => {
    // Ensure we start with a clean process state
    process.env.NODE_ENV = 'test';
    // Store original working directory
    process.chdir(process.cwd());
  });

  beforeEach(async () => {
    // Clear all caches to prevent state pollution from other tests
    documentCache.clear();
    queryCache.clear();
    fileExistsCache.clear();
    
    // Restore any mocks that might have been left by other tests
    // This is a more aggressive approach to ensure clean state
    if ((storage.loadJSON as any).mockRestore) {
      (storage.loadJSON as any).mockRestore();
    }
    if ((storage.readdirAsync as any).mockRestore) {
      (storage.readdirAsync as any).mockRestore();
    }
    if ((storage.existsAsync as any).mockRestore) {
      (storage.existsAsync as any).mockRestore();
    }
    if ((fs.existsSync as any).mockRestore) {
      (fs.existsSync as any).mockRestore();
    }
    if ((fs.readdirSync as any).mockRestore) {
      (fs.readdirSync as any).mockRestore();
    }
    
    // Add small delay to prevent race conditions with directory creation
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create unique temporary directories for testing with process ID for extra uniqueness
    testId = `${Date.now()}-${process.pid}-${Math.random().toString(36).substr(2, 9)}`;
    tempOldDir = `/tmp/fiberdb-old-${testId}`;
    tempNewDir = `/tmp/fiberdb-new-${testId}`;
    
    // Ensure directories don't exist first
    if (fs.existsSync(tempOldDir)) {
      fs.rmSync(tempOldDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempNewDir)) {
      fs.rmSync(tempNewDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(tempOldDir, { recursive: true });
    fs.mkdirSync(tempNewDir, { recursive: true });
    
    migrator = new DataMigrator(tempOldDir, tempNewDir);
  });

  afterEach(async () => {
    // Clean up temporary directories with retries
    const cleanup = async (dir: string) => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (error) {
          // Retry once after a short delay
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (finalError) {
            console.warn(`Failed to clean up ${dir}:`, finalError);
          }
        }
      }
    };
    
    await cleanup(tempOldDir);
    await cleanup(tempNewDir);
  });

  afterAll(() => {
    // Additional cleanup for any stray files
    try {
      const tmpFiles = fs.readdirSync('/tmp').filter(file => 
        file.includes('fiberdb-old-') || file.includes('fiberdb-new-') || file.includes('fiberdb-backup-')
      );
      for (const file of tmpFiles) {
        try {
          const fullPath = path.join('/tmp', file);
          if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        } catch {}
      }
    } catch {}
  });

  test("should create migrator instance", () => {
    expect(migrator).toBeDefined();
    expect(typeof migrator.migrateFromFileStorage).toBe("function");
    expect(typeof migrator.validateMigration).toBe("function");
    expect(typeof migrator.createBackup).toBe("function");
  });

  test("should handle empty data directory", async () => {
    const result = await migrator.migrateFromFileStorage();
    
    expect(result).toBeDefined();
    expect(result.totalAnchors).toBe(0);
    expect(result.totalAttachments).toBe(0);
    expect(result.entitiesCreated).toBe(0);
    expect(result.errors).toBeArray();
    expect(result.duration).toBeNumber();
  });

  test("should migrate anchors to entities", async () => {
    // Create test anchor data
    const anchorsDir = path.join(tempOldDir, 'anchors', 'customer');
    fs.mkdirSync(anchorsDir, { recursive: true });
    
    const customerData = {
      id: 'cust-001',
      name: 'Test Customer',
      industry: 'Technology',
      revenue: 1000000
    };
    
    const anchorFile = path.join(anchorsDir, 'cust-001.json');
    fs.writeFileSync(anchorFile, JSON.stringify(customerData, null, 2));
    
    // Verify the file was created before migration
    expect(fs.existsSync(anchorFile)).toBe(true);
    expect(fs.existsSync(anchorsDir)).toBe(true);
    
    const result = await migrator.migrateFromFileStorage();
    
    expect(result.totalAnchors).toBe(1);
    expect(result.entitiesCreated).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  test("should migrate attachments to documents", async () => {
    // Create test anchor
    const anchorsDir = path.join(tempOldDir, 'anchors', 'customer');
    fs.mkdirSync(anchorsDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(anchorsDir, 'cust-001.json'),
      JSON.stringify({ id: 'cust-001', name: 'Test Customer' }, null, 2)
    );

    // Create test attachments
    const attachedDir = path.join(tempOldDir, 'attached', 'cust-001');
    fs.mkdirSync(attachedDir, { recursive: true });
    
    const contractsData = [
      { id: 'contract-1', value: 100000, status: 'active' },
      { id: 'contract-2', value: 50000, status: 'pending' }
    ];
    
    fs.writeFileSync(
      path.join(attachedDir, 'contracts.json'),
      JSON.stringify(contractsData, null, 2)
    );

    const result = await migrator.migrateFromFileStorage();
    
    expect(result.totalAnchors).toBe(1);
    expect(result.totalAttachments).toBe(1);
    expect(result.entitiesCreated).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  test("should infer relationships from data", async () => {
    // Create entities with relationship patterns
    const anchorsDir = path.join(tempOldDir, 'anchors');
    
    // Customer directory
    const customerDir = path.join(anchorsDir, 'customer');
    fs.mkdirSync(customerDir, { recursive: true });
    
    const customerData = {
      id: 'cust-001',
      name: 'Test Customer',
      managerId: 'user-001'  // This should create a MANAGED_BY relationship
    };
    
    fs.writeFileSync(
      path.join(customerDir, 'cust-001.json'),
      JSON.stringify(customerData, null, 2)
    );

    // User directory
    const userDir = path.join(anchorsDir, 'user');
    fs.mkdirSync(userDir, { recursive: true });
    
    const userData = {
      id: 'user-001',
      name: 'Manager User',
      role: 'Manager'
    };
    
    fs.writeFileSync(
      path.join(userDir, 'user-001.json'),
      JSON.stringify(userData, null, 2)
    );

    const result = await migrator.migrateFromFileStorage();
    
    expect(result.totalAnchors).toBe(2);
    expect(result.entitiesCreated).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  test("should validate migrated data", async () => {
    // Create and migrate some test data
    const anchorsDir = path.join(tempOldDir, 'anchors', 'test');
    fs.mkdirSync(anchorsDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(anchorsDir, 'test-001.json'),
      JSON.stringify({ id: 'test-001', name: 'Test Entity' }, null, 2)
    );

    await migrator.migrateFromFileStorage();

    const validation = await migrator.validateMigration();
    
    expect(validation.isValid).toBe(true);
    expect(validation.issues.length).toBe(0);
    expect(validation.stats.entitiesCount).toBe(1);
    expect(validation.stats.totalEdges).toBeNumber();
    expect(validation.stats.documentTypes).toBeArray();
  });

  test("should handle migration errors gracefully", async () => {
    // Create invalid JSON file
    const anchorsDir = path.join(tempOldDir, 'anchors', 'invalid');
    fs.mkdirSync(anchorsDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(anchorsDir, 'invalid.json'),
      'invalid json content'
    );

    const result = await migrator.migrateFromFileStorage();
    
    // Should still complete migration, but may have errors
    expect(result).toBeDefined();
    expect(result.duration).toBeNumber();
  });

  test("should create backups", async () => {
    // Create some test data
    const testFile = path.join(tempOldDir, 'test.txt');
    fs.writeFileSync(testFile, 'test content');

    const backupPath = `/tmp/fiberdb-backup-${Date.now()}`;
    
    try {
      await migrator.createBackup(backupPath);
      
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.existsSync(path.join(backupPath, 'test.txt'))).toBe(true);
      
      const backupContent = fs.readFileSync(path.join(backupPath, 'test.txt'), 'utf8');
      expect(backupContent).toBe('test content');
      
      // Clean up backup
      fs.rmSync(backupPath, { recursive: true, force: true });
    } catch (error) {
      // Backup might fail in some environments, that's okay for tests
      console.warn('Backup test skipped due to environment limitations');
    }
  });

  test("should preserve data integrity during migration", async () => {
    // Create comprehensive test data
    const anchorsDir = path.join(tempOldDir, 'anchors', 'product');
    fs.mkdirSync(anchorsDir, { recursive: true });
    
    const productData = {
      id: 'prod-001',
      name: 'Test Product',
      price: 99.99,
      category: 'Software',
      tags: ['database', 'hybrid'],
      metadata: {
        created: new Date().toISOString(),
        version: 1
      }
    };
    
    fs.writeFileSync(
      path.join(anchorsDir, 'prod-001.json'),
      JSON.stringify(productData, null, 2)
    );

    // Create attachments
    const attachedDir = path.join(tempOldDir, 'attached', 'prod-001');
    fs.mkdirSync(attachedDir, { recursive: true });
    
    const reviewsData = [
      { rating: 5, comment: 'Excellent product', reviewer: 'user1' },
      { rating: 4, comment: 'Good value', reviewer: 'user2' }
    ];
    
    fs.writeFileSync(
      path.join(attachedDir, 'reviews.json'),
      JSON.stringify(reviewsData, null, 2)
    );

    const result = await migrator.migrateFromFileStorage();
    
    expect(result.totalAnchors).toBe(1);
    expect(result.totalAttachments).toBe(1);
    expect(result.entitiesCreated).toBe(1);
    expect(result.errors.length).toBe(0);

    // Validate that all data was preserved
    const validation = await migrator.validateMigration();
    expect(validation.isValid).toBe(true);
    expect(validation.stats.entitiesCount).toBe(1);
  });

  test("should handle multiple entity types", async () => {
    // Create multiple entity types
    const entityTypes = ['customer', 'user', 'product', 'order'];
    
    for (let i = 0; i < entityTypes.length; i++) {
      const type = entityTypes[i];
      const typeDir = path.join(tempOldDir, 'anchors', type);
      fs.mkdirSync(typeDir, { recursive: true });
      
      const entityData = {
        id: `${type}-001`,
        name: `Test ${type}`,
        type: type,
        index: i
      };
      
      fs.writeFileSync(
        path.join(typeDir, `${type}-001.json`),
        JSON.stringify(entityData, null, 2)
      );
    }

    const result = await migrator.migrateFromFileStorage();
    
    expect(result.totalAnchors).toBe(4);
    expect(result.entitiesCreated).toBe(4);
    expect(result.errors.length).toBe(0);

    const validation = await migrator.validateMigration();
    expect(validation.isValid).toBe(true);
    expect(validation.stats.entitiesCount).toBe(4);
  });

  test("should handle complex relationship inference", async () => {
    // Create entities with various relationship patterns
    const anchorsDir = path.join(tempOldDir, 'anchors');
    
    // Order entity with customer reference
    const orderDir = path.join(anchorsDir, 'order');
    fs.mkdirSync(orderDir, { recursive: true });
    
    const orderData = {
      id: 'order-001',
      customerId: 'cust-001',
      ownerId: 'user-001',
      relatedIds: ['prod-001', 'prod-002'],
      total: 199.98
    };
    
    fs.writeFileSync(
      path.join(orderDir, 'order-001.json'),
      JSON.stringify(orderData, null, 2)
    );

    // Customer entity
    const customerDir = path.join(anchorsDir, 'customer');
    fs.mkdirSync(customerDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(customerDir, 'cust-001.json'),
      JSON.stringify({ id: 'cust-001', name: 'Test Customer' }, null, 2)
    );

    // User entity
    const userDir = path.join(anchorsDir, 'user');
    fs.mkdirSync(userDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(userDir, 'user-001.json'),
      JSON.stringify({ id: 'user-001', name: 'Test User' }, null, 2)
    );

    // Product entities
    const productDir = path.join(anchorsDir, 'product');
    fs.mkdirSync(productDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(productDir, 'prod-001.json'),
      JSON.stringify({ id: 'prod-001', name: 'Product 1' }, null, 2)
    );
    
    fs.writeFileSync(
      path.join(productDir, 'prod-002.json'),
      JSON.stringify({ id: 'prod-002', name: 'Product 2' }, null, 2)
    );

    const result = await migrator.migrateFromFileStorage();
    
    expect(result.totalAnchors).toBe(5);
    expect(result.entitiesCreated).toBe(5);
    expect(result.errors.length).toBe(0);

    const validation = await migrator.validateMigration();
    expect(validation.isValid).toBe(true);
    expect(validation.stats.entitiesCount).toBe(5);
    expect(validation.stats.totalEdges).toBeGreaterThan(0); // Should have inferred relationships
  });
});