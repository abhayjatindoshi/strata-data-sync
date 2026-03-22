import type { DeriveIdFn } from './types.js';

export function deriveId<T>(fn: (entity: T) => string): DeriveIdFn<T> {
  return (entity: T) => {
    const id = fn(entity);
    if (id.includes('.')) {
      throw new Error(`Derived ID must not contain dots: "${id}"`);
    }
    return id;
  };
}
