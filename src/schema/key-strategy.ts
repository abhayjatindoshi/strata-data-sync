import type { KeyStrategy } from './types';

export function partitioned<T>(fn: (entity: T) => string): KeyStrategy<T> {
  return { kind: 'partitioned', partitionFn: fn };
}

export function globalStrategy<T>(): KeyStrategy<T> {
  return { kind: 'global', partitionFn: () => '_' };
}

export function singletonStrategy<T>(): KeyStrategy<T> {
  return { kind: 'singleton', partitionFn: () => '_' };
}
