/**
 * Query Utilities - Shared functions for query processing
 */
import { decrypt } from "../crypto";

/**
 * Apply TTL filtering to determine if a record is still valid
 * @param baseDate The created date of the record
 * @param ttlCutoff The cutoff date for TTL
 * @returns Whether the record is still valid (not expired)
 */
export function isWithinTTL(baseDate: Date, ttlCutoff: Date): boolean {
  return baseDate >= ttlCutoff;
}

/**
 * Decrypt secure fields in a record
 * @param record The record containing encrypted fields
 * @param key Decryption key
 * @returns Decrypted record
 */
export function decryptFields(record: any, key?: string) {
  if (!record || !record.__secure || !key) return record;
  const result = { ...record };
  for (const field of record.__secure) {
    try {
      result[field] = decrypt(result[field], key);
    } catch {
      result[field] = "[decryption failed]";
    }
  }
  return result;
}

/**
 * Apply an operator to compare values
 * @param value The value to check
 * @param operator The comparison operator
 * @param expected The expected value
 * @returns Whether the condition matches
 */
export function applyOperator(value: any, operator: string, expected: any): boolean {
  switch (operator) {
    case "eq": return value === expected;
    case "ne": return value !== expected;
    case "gt": return value > expected;
    case "lt": return value < expected;
    case "contains": return typeof value === "string" && value.includes(expected);
    case "in": return Array.isArray(expected) && expected.includes(value);
    default: return false;
  }
}

/**
 * Check if an object matches all conditions in a filter
 * @param obj The object to check
 * @param conditions The conditions to match
 * @returns Whether all conditions match
 */
export function matchCondition(obj: any, conditions: Record<string, any>): boolean {
  for (const [fieldPath, condition] of Object.entries(conditions)) {
    const [top, ...rest] = fieldPath.split(".");
    
    // Get the value from the object following the path
    let val = obj[top];
    for (const key of rest) {
      if (val === undefined || val === null) {
        val = undefined;
        break;
      }
      val = val[key];
    }
    
    // Apply the condition
    if (typeof condition === "object" && !Array.isArray(condition)) {
      for (const [op, expected] of Object.entries(condition)) {
        if (!applyOperator(val, op, expected)) {
          return false;
        }
      }
    } else {
      if (val !== condition) {
        return false;
      }
    }
  }
  return true;
}