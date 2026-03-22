import type { Tombstone, PartitionBlob } from '../persistence/index.js';

const DEFAULT_RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;

function isExpired(tombstone: Tombstone, cutoff: number): boolean {
  return new Date(tombstone.deletedAt).getTime() < cutoff;
}

export function purgeExpiredTombstones(
  blob: PartitionBlob,
  retentionDays = DEFAULT_RETENTION_DAYS,
  now = Date.now(),
): PartitionBlob {
  const cutoff = now - retentionDays * MS_PER_DAY;
  const deleted: Record<string, Tombstone> = {};
  let changed = false;

  for (const [id, tombstone] of Object.entries(blob.deleted)) {
    if (isExpired(tombstone, cutoff)) {
      changed = true;
    } else {
      deleted[id] = tombstone;
    }
  }

  return changed ? { entities: blob.entities, deleted } : blob;
}

export function createTombstone(
  id: string,
  hlc: Tombstone['hlc'],
  deletedAt = new Date(),
): Tombstone {
  return { id, hlc, deletedAt: deletedAt.toISOString() };
}
