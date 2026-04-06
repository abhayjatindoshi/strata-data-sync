import type { KeyStrategy } from './types';

/**
 * Create a partitioned key strategy. The app-provided `fn` must return a safe
 * partition key: no dots, no null bytes, no path-traversal sequences, and
 * ideally matching `/^[a-zA-Z0-9_-]{1,64}$/`. The framework does not validate
 * partition keys at runtime — the caller is responsible for safe output.
 */
export function partitioned<T>(fn: (entity: T) => string): KeyStrategy<T> {
  return { kind: 'partitioned', partitionFn: fn };
}

export function globalStrategy<T>(): KeyStrategy<T> {
  return { kind: 'global', partitionFn: () => '_' };
}

export function singletonStrategy<T>(): KeyStrategy<T> {
  return { kind: 'singleton', partitionFn: () => '_' };
}
