import type { BaseEntity } from '../entity/index.js';
import { fnvHash } from './fnv-hash.js';

export function computePartitionHash(
  entities: ReadonlyArray<BaseEntity>,
): number {
  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));
  const combined = sorted
    .map(e => `${e.id}:${e.hlc.timestamp}:${e.hlc.counter}:${e.hlc.nodeId}`)
    .join('|');
  return fnvHash(combined);
}
