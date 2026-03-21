import type { KeyStrategy } from '../key-strategy/key-strategy.js';
import { generateId } from './id-generation.js';
import { buildEntityId } from './entity-key.js';

export function composeEntityId(
  strategy: KeyStrategy,
  entityName: string,
  entity: Record<string, unknown>,
): string {
  const partitionKey = strategy.getPartitionKey(entityName, entity);
  const uniqueId = generateId();
  return buildEntityId(entityName, partitionKey, uniqueId);
}
