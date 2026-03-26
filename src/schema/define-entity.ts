import type { EntityDefinition, EntityDefinitionOptions, KeyStrategy } from './types';
import { globalStrategy, singletonStrategy } from './key-strategy';

export function defineEntity<T>(
  name: string,
  options: EntityDefinitionOptions<T> & { readonly keyStrategy: 'singleton' },
): EntityDefinition<T, 'singleton'>;
export function defineEntity<T>(
  name: string,
  options?: EntityDefinitionOptions<T>,
): EntityDefinition<T, 'global' | 'partitioned'>;
export function defineEntity<T>(
  name: string,
  options?: EntityDefinitionOptions<T>,
): EntityDefinition<T> {
  const keyStrategyOption = options?.keyStrategy ?? 'global';
  let keyStrategy: KeyStrategy<T>;

  if (keyStrategyOption === 'global') {
    keyStrategy = globalStrategy<T>();
  } else if (keyStrategyOption === 'singleton') {
    keyStrategy = singletonStrategy<T>();
  } else {
    keyStrategy = keyStrategyOption;
  }

  const deriveId = options?.deriveId ? wrapDeriveId(options.deriveId) : undefined;
  const version = options?.version ?? 1;
  const migrations = options?.migrations;

  return { name, keyStrategy, deriveId, version, migrations };
}

function wrapDeriveId<T>(fn: (entity: T) => string): (entity: T) => string {
  return (entity: T) => {
    const id = fn(entity);
    if (id.includes('.')) {
      throw new Error('deriveId output must not contain dots');
    }
    return id;
  };
}
