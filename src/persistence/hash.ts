import type { Hlc } from '@strata/hlc';
import { FNV_OFFSET, fnv1aAppend } from '@strata/utils';

export function partitionHash(entityMap: ReadonlyMap<string, Hlc>): number {
  const ids = [...entityMap.keys()].sort();
  let hash = FNV_OFFSET;
  for (const id of ids) {
    const hlc = entityMap.get(id)!;
    hash = fnv1aAppend(hash, `${id}:${hlc.timestamp}:${hlc.counter}:${hlc.nodeId}`);
  }
  return hash;
}
