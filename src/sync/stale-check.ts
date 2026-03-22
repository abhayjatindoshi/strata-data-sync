import type { PartitionMeta } from './sync-types';

export function isStale(
  before: Readonly<Record<string, PartitionMeta>>,
  after: Readonly<Record<string, PartitionMeta>>,
  entityKeys: readonly string[],
): boolean {
  for (const key of entityKeys) {
    const b = before[key];
    const a = after[key];
    if (!b && a) return true;
    if (b && !a) return true;
    if (b && a && (b.hash !== a.hash || b.updatedAt !== a.updatedAt)) return true;
  }
  return false;
}
