import type { ParsedEntityId } from './types.js';

export function parseEntityId(entityId: string): ParsedEntityId {
  const parts = entityId.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid entity ID format: "${entityId}"`);
  }
  return {
    entityName: parts[0]!,
    partitionKey: parts[1]!,
    uniqueId: parts[2]!,
  };
}

export function getEntityKey(entityId: string): string {
  const { entityName, partitionKey } = parseEntityId(entityId);
  return `${entityName}.${partitionKey}`;
}
