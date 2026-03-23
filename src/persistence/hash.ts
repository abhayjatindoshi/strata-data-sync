import type { Hlc } from '@strata/hlc';

export const FNV_OFFSET = 2166136261;
export const FNV_PRIME = 16777619;

export function fnv1a(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

export function fnv1aAppend(hash: number, input: string): number {
  let h = hash;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

export function partitionHash(entityMap: ReadonlyMap<string, Hlc>): number {
  const ids = [...entityMap.keys()].sort();
  let hash = FNV_OFFSET;
  for (const id of ids) {
    const hlc = entityMap.get(id)!;
    hash = fnv1aAppend(hash, `${id}:${hlc.timestamp}:${hlc.counter}:${hlc.nodeId}`);
  }
  return hash;
}
