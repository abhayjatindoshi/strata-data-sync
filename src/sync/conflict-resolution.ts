import type { EntityHlc, MergeResult } from './sync-types.js';

export function compareEntityHlc(a: EntityHlc, b: EntityHlc): -1 | 0 | 1 {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
  if (a.version !== b.version) return a.version < b.version ? -1 : 1;
  if (a.device < b.device) return -1;
  if (a.device > b.device) return 1;
  return 0;
}

export function resolveConflict(a: EntityHlc, b: EntityHlc): MergeResult {
  const cmp = compareEntityHlc(a, b);

  if (cmp > 0) {
    return { winner: 'a', deleted: a.deleted ?? false };
  }
  if (cmp < 0) {
    return { winner: 'b', deleted: b.deleted ?? false };
  }

  const aDeleted = a.deleted ?? false;
  const bDeleted = b.deleted ?? false;

  if (aDeleted === bDeleted) {
    return { winner: 'equal', deleted: aDeleted };
  }

  return aDeleted
    ? { winner: 'a', deleted: true }
    : { winner: 'b', deleted: true };
}
