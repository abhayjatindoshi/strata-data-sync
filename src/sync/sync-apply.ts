import type { EntityMetadataMap, EntityHlc, SyncEntity, ApplyResult, PartitionMeta } from './sync-types';
import { resolveConflict } from './conflict-resolution';
import { fnv1a } from '@strata/persistence';

type EntityPairResult = {
  source: 'a' | 'b' | undefined;
  deleted: boolean;
  conflict: boolean;
};

function resolveEntityPair(
  aHlc: EntityHlc | undefined,
  bHlc: EntityHlc | undefined,
): EntityPairResult {
  if (aHlc && !bHlc) {
    const deleted = aHlc.deleted ?? false;
    return { source: deleted ? undefined : 'a', deleted, conflict: false };
  }
  if (!aHlc && bHlc) {
    const deleted = bHlc.deleted ?? false;
    return { source: deleted ? undefined : 'b', deleted, conflict: false };
  }
  if (!aHlc || !bHlc) {
    return { source: undefined, deleted: false, conflict: false };
  }

  const result = resolveConflict(aHlc, bHlc);
  if (result.winner === 'equal') {
    return { source: result.deleted ? undefined : 'a', deleted: result.deleted, conflict: false };
  }
  return {
    source: result.deleted ? undefined : result.winner,
    deleted: result.deleted,
    conflict: true,
  };
}

export function mergePartitionEntities(
  aEntities: readonly SyncEntity[],
  bEntities: readonly SyncEntity[],
  aMeta: EntityMetadataMap,
  bMeta: EntityMetadataMap,
): ApplyResult {
  const aMap = new Map(aEntities.map(e => [e.id, e]));
  const bMap = new Map(bEntities.map(e => [e.id, e]));
  const allIds = new Set([...Object.keys(aMeta), ...Object.keys(bMeta)]);

  const merged: SyncEntity[] = [];
  const deletedIds: string[] = [];
  let conflictsResolved = 0;

  for (const id of allIds) {
    const resolved = resolveEntityPair(aMeta[id], bMeta[id]);
    if (resolved.deleted) {
      deletedIds.push(id);
    } else if (resolved.source) {
      const entity = (resolved.source === 'a' ? aMap : bMap).get(id);
      if (entity) merged.push(entity);
    }
    if (resolved.conflict) conflictsResolved++;
  }

  return { merged, deletedIds, conflictsResolved };
}

export function recomputeMetadata(
  serializedContent: string,
  maxTimestamp: number,
): PartitionMeta {
  return { hash: fnv1a(serializedContent), updatedAt: maxTimestamp };
}
