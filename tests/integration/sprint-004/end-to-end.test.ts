import { describe, it, expect } from 'vitest';
import {
  metadataDiff,
  deepDiff,
  mergePartitionEntities,
  recomputeMetadata,
  isStale,
  createDirtyTracker,
  createSyncScheduler,
} from '../../../src/sync/index.js';
import { serialize } from '../../../src/persistence/index.js';
import type { PartitionMeta, EntityMetadataMap, SyncEntity } from '../../../src/sync/index.js';

describe('Integration: end-to-end sync flow', () => {
  it('full flow: dirty detection → metadata diff → deep diff → merge → recompute → stale check', () => {
    // 1. Dirty tracking: a store mutation marks a partition dirty
    const tracker = createDirtyTracker();
    tracker.markDirty('task:2026-03');
    expect(tracker.isDirty('task:2026-03')).toBe(true);

    // 2. Schedule sync for the dirty partition
    const scheduler = createSyncScheduler();
    for (const key of tracker.getDirtyPartitions()) {
      scheduler.schedule('store-to-local', key);
    }
    expect(scheduler.pending()).toBe(1);

    // 3. Flush the scheduler to get tasks
    const tasks = scheduler.flush();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].entityKey).toBe('task:2026-03');

    // 4. Metadata diff between store and local tiers
    const storeMeta: Record<string, PartitionMeta> = {
      'task:2026-03': { hash: 999, updatedAt: 500 },
    };
    const localMeta: Record<string, PartitionMeta> = {
      'task:2026-03': { hash: 111, updatedAt: 300 },
    };
    const mdResult = metadataDiff(storeMeta, localMeta);
    expect(mdResult.mismatched).toContain('task:2026-03');

    // 5. Deep diff for the mismatched partition
    const storeEntityMeta: EntityMetadataMap = {
      e1: { updatedAt: 500, version: 2, device: 'device-A' },
      e2: { updatedAt: 300, version: 1, device: 'device-A' },
    };
    const localEntityMeta: EntityMetadataMap = {
      e1: { updatedAt: 300, version: 1, device: 'device-A' },
      e2: { updatedAt: 400, version: 1, device: 'device-B' },
    };
    const ddResult = deepDiff(storeEntityMeta, localEntityMeta);
    expect(ddResult.entries).toHaveLength(2);
    expect(ddResult.oneWayCopy).toBeUndefined(); // changes in both directions

    // 6. Merge partition entities
    const storeEntities: SyncEntity[] = [
      { id: 'e1', title: 'Store E1 v2' },
      { id: 'e2', title: 'Store E2' },
    ];
    const localEntities: SyncEntity[] = [
      { id: 'e1', title: 'Local E1 v1' },
      { id: 'e2', title: 'Local E2 updated' },
    ];
    const mergeResult = mergePartitionEntities(
      storeEntities, localEntities,
      storeEntityMeta, localEntityMeta,
    );
    expect(mergeResult.merged).toHaveLength(2);
    const mergedE1 = mergeResult.merged.find(e => e.id === 'e1');
    expect(mergedE1?.title).toBe('Store E1 v2'); // store wins for e1
    const mergedE2 = mergeResult.merged.find(e => e.id === 'e2');
    expect(mergedE2?.title).toBe('Local E2 updated'); // local wins for e2
    expect(mergeResult.conflictsResolved).toBe(2);

    // 7. Recompute metadata after merge
    const mergedContent = serialize(mergeResult.merged);
    const newMeta = recomputeMetadata(mergedContent, 500);
    expect(newMeta.hash).toBeTypeOf('number');
    expect(newMeta.updatedAt).toBe(500);

    // 8. Stale check: verify source hasn't changed during sync
    const staleResult = isStale(storeMeta, storeMeta, ['task:2026-03']);
    expect(staleResult).toBe(false); // not stale — safe to write back

    // 9. Clear dirty state after successful sync
    tracker.clear('task:2026-03');
    expect(tracker.isDirty('task:2026-03')).toBe(false);
  });

  it('skips write-back when stale is detected during sync', () => {
    const storeBefore: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    // Simulate concurrent modification: hash changed during sync
    const storeAfter: Record<string, PartitionMeta> = {
      'task:p1': { hash: 777, updatedAt: 2000 },
    };
    expect(isStale(storeBefore, storeAfter, ['task:p1'])).toBe(true);
    // In real code, we'd skip writing back and defer to next cycle
  });

  it('handles multiple dirty partitions in a batch', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('task:p1');
    tracker.markDirty('task:p2');
    tracker.markDirty('note:p1');

    const scheduler = createSyncScheduler();
    for (const key of tracker.getDirtyPartitions()) {
      scheduler.schedule('store-to-local', key);
    }
    expect(scheduler.pending()).toBe(3);

    const tasks = scheduler.flush();
    expect(tasks).toHaveLength(3);

    // Duplicate scheduling is deduplicated
    for (const key of tracker.getDirtyPartitions()) {
      scheduler.schedule('store-to-local', key);
      scheduler.schedule('store-to-local', key);
    }
    expect(scheduler.pending()).toBe(3);
  });
});
