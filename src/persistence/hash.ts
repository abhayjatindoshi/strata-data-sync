import type { Hlc } from '@strata/hlc';
import { FNV_OFFSET, fnv1aAppend } from '@strata/utils';

export function partitionHash(entityMap: ReadonlyMap<string, Hlc>): number {
  const entries = [...entityMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  let hash = FNV_OFFSET;
  for (const [id, hlc] of entries) {
    hash = fnv1aAppend(hash, `${id}:${hlc.timestamp}:${hlc.counter}:${hlc.nodeId}`);
  }
  return hash;
}
