import { compareHlc } from '@strata/hlc';
import type { Hlc } from '@strata/hlc';
import type { PartitionBlob, Tombstone } from '@strata/persistence';

type EntityWithHlc = {
  readonly hlc: Hlc;
};

type MergeEntry =
  | { readonly type: 'live'; readonly entity: unknown; readonly hlc: Hlc }
  | { readonly type: 'deleted'; readonly tombstone: Tombstone; readonly hlc: Hlc };

// Cast justified: entities in PartitionBlob are BaseEntity with hlc field
function getEntityHlc(entity: unknown): Hlc {
  return (entity as EntityWithHlc).hlc;
}

function toEntry(
  id: string,
  entities: Record<string, unknown>,
  deleted: Record<string, Tombstone>,
): MergeEntry | undefined {
  const entity = entities[id];
  if (entity !== undefined) {
    return { type: 'live' as const, entity, hlc: getEntityHlc(entity) };
  }
  const tombstone = deleted[id];
  if (tombstone !== undefined) {
    return { type: 'deleted' as const, tombstone, hlc: tombstone.hlc };
  }
  return undefined;
}

function pickWinner(a: MergeEntry, b: MergeEntry): MergeEntry {
  return compareHlc(a.hlc, b.hlc) >= 0 ? a : b;
}

function collectIds(a: PartitionBlob, b: PartitionBlob): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(a.entities)) ids.add(id);
  for (const id of Object.keys(a.deleted)) ids.add(id);
  for (const id of Object.keys(b.entities)) ids.add(id);
  for (const id of Object.keys(b.deleted)) ids.add(id);
  return ids;
}

function resolveEntry(
  local: MergeEntry | undefined,
  cloud: MergeEntry | undefined,
): MergeEntry | undefined {
  if (local && cloud) return pickWinner(local, cloud);
  return local ?? cloud;
}

export function mergePartitionBlobs(
  local: PartitionBlob,
  cloud: PartitionBlob,
): PartitionBlob {
  const entities: Record<string, unknown> = {};
  const deleted: Record<string, Tombstone> = {};
  const allIds = collectIds(local, cloud);

  for (const id of allIds) {
    const localEntry = toEntry(id, local.entities, local.deleted);
    const cloudEntry = toEntry(id, cloud.entities, cloud.deleted);
    const winner = resolveEntry(localEntry, cloudEntry);
    if (!winner) continue;
    if (winner.type === 'live') {
      entities[id] = winner.entity;
    } else {
      deleted[id] = winner.tombstone;
    }
  }

  return { entities, deleted };
}
