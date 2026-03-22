import type { EntityMetadataMap, DeepDiffResult, EntityDiffEntry } from './sync-types';
import { resolveConflict } from './conflict-resolution';

export function deepDiff(
  a: EntityMetadataMap,
  b: EntityMetadataMap,
): DeepDiffResult {
  const entries: EntityDiffEntry[] = [];
  let aHasNewer = false;
  let bHasNewer = false;

  for (const id of Object.keys(a)) {
    const aHlc = a[id];
    const bHlc = b[id];
    if (!aHlc) continue;

    if (!bHlc) {
      entries.push({ id, direction: 'a-to-b' });
      aHasNewer = true;
      continue;
    }

    const result = resolveConflict(aHlc, bHlc);
    if (result.winner === 'a') {
      entries.push({ id, direction: 'a-to-b' });
      aHasNewer = true;
    } else if (result.winner === 'b') {
      entries.push({ id, direction: 'b-to-a' });
      bHasNewer = true;
    }
  }

  for (const id of Object.keys(b)) {
    if (!a[id]) {
      entries.push({ id, direction: 'b-to-a' });
      bHasNewer = true;
    }
  }

  let oneWayCopy: 'a-to-b' | 'b-to-a' | undefined;
  if (entries.length > 0) {
    if (aHasNewer && !bHasNewer) oneWayCopy = 'a-to-b';
    else if (bHasNewer && !aHasNewer) oneWayCopy = 'b-to-a';
  }

  return { oneWayCopy, entries };
}
