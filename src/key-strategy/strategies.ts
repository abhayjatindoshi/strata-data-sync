import type { KeyStrategy } from './types.js';

export const singleton: KeyStrategy = {
  type: 'singleton',
  getPartitionKey: () => '_',
};

export const global: KeyStrategy = {
  type: 'global',
  getPartitionKey: () => '_',
};

export function partitioned<T>(fn: (entity: T) => string): KeyStrategy<T> {
  return {
    type: 'partitioned',
    getPartitionKey: fn,
  };
}
