import { Entity } from '../types/enhanced/entity';
import { CustomStorageEngine } from '../core/storage/engines/custom-storage-engine';
import { loadJSON, readdirAsync } from '../core/storage';
import path from 'path';
import config from '../config';

export interface MigrationResult {
  totalAnchors: number;
  totalAttachments: number;
  entitiesCreated: number;
  errors: string[];
  duration: number;
}

export class DataMigrator {
  constructor(private oldDataPath: string, private newDataPath: string) {}

  async migrateFromFileStorage(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      totalAnchors: 0,
      totalAttachments: 0,
      entitiesCreated: 0,
      errors: [],
      duration: 0
    };

    try {
      console.log('Starting migration from file storage...');
      
      // Initialize new storage engine
      const newEngine = new CustomStorageEngine(this.newDataPath);
      await newEngine.initialize();

      // Load anchors and attachments
      const anchors = await this.loadAnchors();
      const attachments = await this.loadAttachments();

      result.totalAnchors = anchors.length;
      result.totalAttachments = Object.keys(attachments).length;

      console.log(`Found ${result.totalAnchors} anchors and ${result.totalAttachments} attachment groups`);

      // Convert to entities
      const entities = this.convertToEntities(anchors, attachments);

      console.log(`Created ${entities.length} entities`);

      // Save to new engine
      for (const entity of entities) {
        try {
          await newEngine.saveEntity(entity);
          result.entitiesCreated++;
        } catch (error) {
          result.errors.push(`Failed to save entity ${entity.type}:${entity.id}: ${error}`);
        }
      }

      await newEngine.close();
      
      result.duration = Date.now() - startTime;
      console.log(`Migration completed in ${result.duration}ms`);
      
      return result;
    } catch (error) {
      result.errors.push(`Migration failed: ${error}`);
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  private async loadAnchors(): Promise<Array<{ type: string; id: string; data: any }>> {
    const anchors: Array<{ type: string; id: string; data: any }> = [];
    const anchorsPath = path.join(this.oldDataPath, 'anchors');

    try {
      const typeDirectories = await readdirAsync(anchorsPath);
      
      for (const typeDir of typeDirectories) {
        const typePath = path.join(anchorsPath, typeDir);
        const anchorFiles = await readdirAsync(typePath);
        
        for (const anchorFile of anchorFiles) {
          if (anchorFile.endsWith('.json')) {
            const anchorPath = path.join(typePath, anchorFile);
            const data = loadJSON(anchorPath);
            
            if (data) {
              const id = anchorFile.replace('.json', '');
              anchors.push({ type: typeDir, id, data });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load anchors: ${error}`);
    }

    return anchors;
  }

  private async loadAttachments(): Promise<Record<string, Record<string, any[]>>> {
    const attachments: Record<string, Record<string, any[]>> = {};
    const attachedPath = path.join(this.oldDataPath, 'attached');

    try {
      const anchorDirectories = await readdirAsync(attachedPath);
      
      for (const anchorId of anchorDirectories) {
        const anchorAttachedPath = path.join(attachedPath, anchorId);
        const attachmentFiles = await readdirAsync(anchorAttachedPath);
        
        attachments[anchorId] = {};
        
        for (const attachmentFile of attachmentFiles) {
          if (attachmentFile.endsWith('.json')) {
            const attachmentPath = path.join(anchorAttachedPath, attachmentFile);
            const data = loadJSON(attachmentPath);
            
            if (data && Array.isArray(data)) {
              const attachmentType = attachmentFile.replace('.json', '');
              attachments[anchorId][attachmentType] = data;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load attachments: ${error}`);
    }

    return attachments;
  }

  private convertToEntities(
    anchors: Array<{ type: string; id: string; data: any }>,
    attachments: Record<string, Record<string, any[]>>
  ): Entity[] {
    const entities: Entity[] = [];
    
    for (const anchor of anchors) {
      const entity: Entity = {
        id: anchor.id,
        type: anchor.type,
        attributes: { ...anchor.data },
        documents: {},
        edges: [],
        metadata: {
          created: new Date(),
          updated: new Date(),
          version: 1,
          schemaVersion: 1,
          tags: ['migrated']
        }
      };

      // Remove internal fields from attributes
      delete entity.attributes.__secure;

      // Add attachments as documents
      const anchorKey = anchor.id;
      if (attachments[anchorKey]) {
        entity.documents = attachments[anchorKey];
      }

      // Try to infer relationships from data
      this.inferRelationships(entity, anchors);

      entities.push(entity);
    }

    return entities;
  }

  private inferRelationships(entity: Entity, allAnchors: Array<{ type: string; id: string; data: any }>): void {
    // Look for common relationship patterns in the data
    const relationshipFields = ['parentId', 'parent_id', 'ownerId', 'owner_id', 'managerId', 'manager_id'];
    
    for (const field of relationshipFields) {
      const value = entity.attributes[field];
      if (value) {
        // Try to find the target entity
        const relationshipType = field.replace(/Id$/, '').replace(/_id$/, '').toUpperCase();
        
        // Look for target entity
        const targetAnchor = allAnchors.find(a => a.id === value);
        if (targetAnchor) {
          entity.edges.push({
            id: `${entity.id}_${relationshipType}_${value}`,
            type: relationshipType,
            target: `${targetAnchor.type}:${targetAnchor.id}`,
            properties: {
              inferred: true,
              sourceField: field
            }
          });
        }
      }
    }

    // Look for array fields that might contain IDs
    const arrayFields = ['tags', 'categories', 'related_ids', 'relatedIds'];
    
    for (const field of arrayFields) {
      const value = entity.attributes[field];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            // Try to find matching entities
            const targetAnchor = allAnchors.find(a => a.id === item);
            if (targetAnchor) {
              entity.edges.push({
                id: `${entity.id}_RELATED_${item}`,
                type: 'RELATED',
                target: `${targetAnchor.type}:${targetAnchor.id}`,
                properties: {
                  inferred: true,
                  sourceField: field
                }
              });
            }
          }
        }
      }
    }
  }

  async validateMigration(): Promise<{
    isValid: boolean;
    issues: string[];
    stats: {
      entitiesCount: number;
      totalEdges: number;
      documentTypes: string[];
    };
  }> {
    const issues: string[] = [];
    const stats = {
      entitiesCount: 0,
      totalEdges: 0,
      documentTypes: new Set<string>()
    };

    try {
      const newEngine = new CustomStorageEngine(this.newDataPath);
      await newEngine.initialize();

      const engineStats = await newEngine.getStats();
      stats.entitiesCount = engineStats.totalEntities;
      stats.totalEdges = engineStats.totalEdges;

      await newEngine.close();

      // Basic validation
      if (stats.entitiesCount === 0) {
        issues.push('No entities found in migrated data');
      }

      return {
        isValid: issues.length === 0,
        issues,
        stats: {
          ...stats,
          documentTypes: Array.from(stats.documentTypes)
        }
      };
    } catch (error) {
      issues.push(`Validation failed: ${error}`);
      return {
        isValid: false,
        issues,
        stats: {
          ...stats,
          documentTypes: Array.from(stats.documentTypes)
        }
      };
    }
  }

  async createBackup(backupPath: string): Promise<void> {
    // Simple backup by copying data directory
    try {
      const fs = await import('fs');
      const { execSync } = await import('child_process');
      
      if (fs.existsSync(this.oldDataPath)) {
        execSync(`cp -r "${this.oldDataPath}" "${backupPath}"`);
        console.log(`Backup created at: ${backupPath}`);
      }
    } catch (error) {
      throw new Error(`Backup failed: ${error}`);
    }
  }
}

// Migration CLI utility
export async function runMigration(
  oldPath: string = config.storage.baseDir,
  newPath: string = config.storage.baseDir + '_v2',
  createBackup: boolean = true
): Promise<void> {
  console.log('=== FiberDB Migration Utility ===');
  console.log(`Old data path: ${oldPath}`);
  console.log(`New data path: ${newPath}`);

  const migrator = new DataMigrator(oldPath, newPath);

  try {
    // Create backup if requested
    if (createBackup) {
      const backupPath = `${oldPath}_backup_${Date.now()}`;
      console.log('Creating backup...');
      await migrator.createBackup(backupPath);
      console.log(`Backup created: ${backupPath}`);
    }

    // Run migration
    console.log('Starting migration...');
    const result = await migrator.migrateFromFileStorage();

    // Report results
    console.log('\n=== Migration Results ===');
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Anchors processed: ${result.totalAnchors}`);
    console.log(`Attachment groups processed: ${result.totalAttachments}`);
    console.log(`Entities created: ${result.entitiesCreated}`);
    console.log(`Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

    // Validate migration
    console.log('\nValidating migration...');
    const validation = await migrator.validateMigration();
    
    if (validation.isValid) {
      console.log('✅ Migration validation passed');
      console.log(`Entities: ${validation.stats.entitiesCount}`);
      console.log(`Edges: ${validation.stats.totalEdges}`);
      console.log(`Document types: ${validation.stats.documentTypes.join(', ')}`);
    } else {
      console.log('❌ Migration validation failed');
      validation.issues.forEach(issue => console.log(`  - ${issue}`));
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}