import type { KeyStrategy } from '@strata/key-strategy/key-strategy';
import { generateId } from './id-generation';
import { buildEntityId } from './entity-key';

export function composeEntityId(
  strategy: KeyStrategy,
  entityName: string,
  entity: Record<string, unknown>,
): string {
  const partitionKey = strategy.getPartitionKey(entityName, entity);
  const uniqueId = generateId();
  return buildEntityId(entityName, partitionKey, uniqueId);
}
