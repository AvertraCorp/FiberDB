export interface Entity {
  id: string;
  type: string;
  
  // Structured data (replaces anchor.data)
  attributes: Record<string, any>;
  
  // Unstructured data (replaces attachments)
  documents: Record<string, any[]>;
  
  // Graph relationships (new capability)
  edges: Edge[];
  
  // Enhanced metadata
  metadata: EntityMetadata;
}

export interface Edge {
  id: string;
  type: string;           // Relationship type: "OWNS", "LOCATED_AT", etc.
  target: string;         // Target entity ID
  properties?: any;       // Edge properties
  weight?: number;        // Relationship strength
  temporal?: {            // Time-based relationships
    validFrom: Date;
    validTo?: Date;
  };
}

export interface EntityMetadata {
  created: Date;
  updated: Date;
  version: number;
  tags?: string[];
  schemaVersion: number;
}

export interface SchemaVersion {
  version: number;
  entityTypes: Record<string, EntitySchema>;
  migrations: Migration[];
}

export interface EntitySchema {
  type: string;
  requiredAttributes: string[];
  optionalAttributes: string[];
  documentTypes: string[];
  allowedEdgeTypes: string[];
  validationRules: ValidationRule[];
}

export interface Migration {
  fromVersion: number;
  toVersion: number;
  transform: (entity: Entity) => Entity;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'pattern';
  constraint: any;
}