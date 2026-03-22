import type { KeyStrategy } from './types.js';
import { partitioned } from './strategies.js';

export function monthlyPartition<T extends Record<string, unknown>>(
  field: string & keyof T,
): KeyStrategy<T> {
  return partitioned<T>((entity: T) => {
    const value = entity[field];
    if (!(value instanceof Date)) {
      throw new Error(`Field "${field}" is not a Date`);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
}
