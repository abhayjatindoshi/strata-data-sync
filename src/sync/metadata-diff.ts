import type { PartitionMeta, MetadataDiffResult } from './sync-types.js';

export function metadataDiff(
  a: Readonly<Record<string, PartitionMeta>>,
  b: Readonly<Record<string, PartitionMeta>>,
): MetadataDiffResult {
  const aOnly: string[] = [];
  const bOnly: string[] = [];
  const mismatched: string[] = [];

  for (const key of Object.keys(a)) {
    const aEntry = a[key];
    const bEntry = b[key];
    if (!aEntry) continue;
    if (!bEntry) {
      aOnly.push(key);
    } else if (aEntry.hash !== bEntry.hash) {
      mismatched.push(key);
    }
  }

  for (const key of Object.keys(b)) {
    if (!a[key]) {
      bOnly.push(key);
    }
  }

  return { aOnly, bOnly, mismatched };
}
