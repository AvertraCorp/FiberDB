import { Entity, Edge } from '../../../types/enhanced/entity';

export interface LogEntry {
  timestamp: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ADD_EDGE' | 'REMOVE_EDGE';
  entityType: string;
  entityId: string;
  data?: Entity;
  edgeData?: Edge;
  transactionId?: string;
}

export interface WALSnapshot {
  timestamp: number;
  entities: Record<string, Entity>;
  metadata: {
    totalEntries: number;
    lastCompaction: number;
  };
}