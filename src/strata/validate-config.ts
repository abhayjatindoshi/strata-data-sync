import type { StrataConfig } from './types.js';
import type { EntityDefinition } from '@strata/schema';

export function validateConfig(config: StrataConfig): void {
  if (!config.entities || config.entities.length === 0) {
    throw new Error('entities array must not be empty');
  }
  if (!config.nodeId || config.nodeId.trim() === '') {
    throw new Error('nodeId must not be empty');
  }
  const names = new Set<string>();
  for (const def of config.entities) {
    if (names.has(def.name)) {
      throw new Error(`Duplicate entity name: ${def.name}`);
    }
    names.add(def.name);
  }
}

export function findDefinition(
  entities: ReadonlyArray<EntityDefinition<any>>,
  name: string,
): EntityDefinition<any> | undefined {
  return entities.find(e => e.name === name);
}
