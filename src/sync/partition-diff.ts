import type { PartitionIndex } from '../persistence/index.js';
import type { PartitionDiff } from './types.js';

export function comparePartitionIndexes(
  local: PartitionIndex,
  cloud: PartitionIndex,
): PartitionDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const localKeys = new Set(Object.keys(local));

  for (const [key, localEntry] of Object.entries(local)) {
    const cloudEntry = cloud[key];
    if (!cloudEntry) {
      removed.push(key);
    } else if (localEntry.hash !== cloudEntry.hash) {
      changed.push(key);
    } else {
      unchanged.push(key);
    }
  }

  for (const key of Object.keys(cloud)) {
    if (!localKeys.has(key)) {
      added.push(key);
    }
  }

  return { added, removed, changed, unchanged };
}
