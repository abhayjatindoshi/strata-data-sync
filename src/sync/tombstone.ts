import type { Hlc } from '@strata/hlc';

export const DEFAULT_TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function purgeStaleTombstones(
  tombstones: Map<string, Hlc>,
  retentionMs: number,
  now: number,
): number {
  const cutoff = now - retentionMs;
  let purged = 0;

  for (const [id, hlc] of tombstones) {
    if (hlc.timestamp < cutoff) {
      tombstones.delete(id);
      purged++;
    }
  }

  return purged;
}
