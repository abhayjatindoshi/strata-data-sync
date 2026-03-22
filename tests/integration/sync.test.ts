import { describe, it, expect } from 'vitest';
import {
  compareEntityHlc,
  resolveConflict,
  metadataDiff,
  deepDiff,
  mergePartitionEntities,
  recomputeMetadata,
  isStale,
  createDirtyTracker,
  createSyncScheduler,
} from '@strata/sync';
import { serialize } from '@strata/persistence';
import type {
  EntityHlc,
  EntityMetadataMap,
  EntityDiffEntry,
  PartitionMeta,
  SyncEntity,
} from '@strata/sync';

// ── Conflict Resolution ─────────────────────────────────────────────
describe('Conflict Resolution', () => {
  describe('LWW via HLC', () => {
    it('picks higher updatedAt as winner', () => {
      const a: EntityHlc = { updatedAt: 200, version: 1, device: 'A' };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      expect(resolveConflict(a, b).winner).toBe('a');
      expect(resolveConflict(b, a).winner).toBe('b');
    });

    it('falls back to version when updatedAt is equal', () => {
      const a: EntityHlc = { updatedAt: 100, version: 5, device: 'A' };
      const b: EntityHlc = { updatedAt: 100, version: 3, device: 'A' };
      expect(resolveConflict(a, b).winner).toBe('a');
    });

    it('falls back to device tiebreaker when all else is equal', () => {
      const a: EntityHlc = { updatedAt: 100, version: 1, device: 'B' };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      expect(resolveConflict(a, b).winner).toBe('a');
    });

    it('returns equal when HLCs are identical and both alive', () => {
      const hlc: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      const result = resolveConflict(hlc, { ...hlc });
      expect(result.winner).toBe('equal');
      expect(result.deleted).toBe(false);
    });
  });

  describe('delete-wins-on-equal', () => {
    it('deleted side wins when HLCs are otherwise equal', () => {
      const alive: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      const dead: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const result = resolveConflict(alive, dead);
      expect(result.winner).toBe('b');
      expect(result.deleted).toBe(true);
    });

    it('both deleted + equal HLC returns equal with deleted true', () => {
      const a: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const result = resolveConflict(a, b);
      expect(result.winner).toBe('equal');
      expect(result.deleted).toBe(true);
    });

    it('higher HLC still wins even if the other is deleted', () => {
      const a: EntityHlc = { updatedAt: 200, version: 1, device: 'A' };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const result = resolveConflict(a, b);
      expect(result.winner).toBe('a');
      expect(result.deleted).toBe(false);
    });
  });

  describe('compareEntityHlc ordering', () => {
    it('returns -1, 0, 1 correctly', () => {
      const low: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      const high: EntityHlc = { updatedAt: 200, version: 1, device: 'A' };
      expect(compareEntityHlc(low, high)).toBe(-1);
      expect(compareEntityHlc(high, low)).toBe(1);
      expect(compareEntityHlc(low, { ...low })).toBe(0);
    });
  });
});

// ── Deep Diff ───────────────────────────────────────────────────────
describe('Deep Diff', () => {
  it('detects one-way-copy when only A has newer entities', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'A' },
      e2: { updatedAt: 300, version: 1, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
      e2: { updatedAt: 100, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('a-to-b');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e: EntityDiffEntry) => e.direction === 'a-to-b')).toBe(true);
  });

  it('detects one-way-copy when only B has newer entities', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'A' },
      e2: { updatedAt: 300, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('b-to-a');
    expect(result.entries).toHaveLength(2);
  });

  it('returns no oneWayCopy when changes go both directions', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 300, version: 1, device: 'A' },
      e2: { updatedAt: 100, version: 1, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
      e2: { updatedAt: 300, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBeUndefined();
    expect(result.entries).toHaveLength(2);
  });

  it('returns empty entries when metadata is identical', () => {
    const same: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const result = deepDiff(same, { ...same });
    expect(result.entries).toHaveLength(0);
    expect(result.oneWayCopy).toBeUndefined();
  });

  it('handles new entities only on one side as one-way-copy', () => {
    const a: EntityMetadataMap = {};
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'B' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('b-to-a');
    expect(result.entries).toEqual([{ id: 'e1', direction: 'b-to-a' }]);
  });

  it('uses HLC comparison for per-entity direction', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 2, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.entries).toEqual([{ id: 'e1', direction: 'a-to-b' }]);
  });
});

// ── Dirty Tracker ───────────────────────────────────────────────────
describe('Dirty Tracker', () => {
  it('starts with no dirty partitions and version 0', () => {
    const tracker = createDirtyTracker();
    expect(tracker.getDirtyPartitions()).toEqual([]);
    expect(tracker.version()).toBe(0);
  });

  it('marks a partition dirty and increments version', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('task:2026-03');
    expect(tracker.isDirty('task:2026-03')).toBe(true);
    expect(tracker.version()).toBe(1);
  });

  it('version increments on each markDirty call', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('a');
    tracker.markDirty('b');
    tracker.markDirty('c');
    expect(tracker.version()).toBe(3);
  });

  it('clears a single partition', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('p1');
    tracker.markDirty('p2');
    tracker.clear('p1');
    expect(tracker.isDirty('p1')).toBe(false);
    expect(tracker.isDirty('p2')).toBe(true);
  });

  it('clearAll resets all dirty state', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('p1');
    tracker.markDirty('p2');
    tracker.clearAll();
    expect(tracker.getDirtyPartitions()).toEqual([]);
  });

  it('getDirtyPartitions returns all marked keys', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('task:p1');
    tracker.markDirty('note:p2');
    const dirty = tracker.getDirtyPartitions();
    expect(dirty).toContain('task:p1');
    expect(dirty).toContain('note:p2');
    expect(dirty).toHaveLength(2);
  });

  it('marking the same key twice does not duplicate it', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('p1');
    tracker.markDirty('p1');
    expect(tracker.getDirtyPartitions()).toHaveLength(1);
    expect(tracker.version()).toBe(2);
  });
});

// ── Metadata Diff ───────────────────────────────────────────────────
describe('Metadata Diff', () => {
  it('returns empty buckets when both sides match', () => {
    const meta: Record<string, PartitionMeta> = {
      'task:2026-03': { hash: 111, updatedAt: 100 },
      'task:2026-04': { hash: 222, updatedAt: 200 },
    };
    const result = metadataDiff(meta, { ...meta });
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });

  it('categorizes partitions into 3 buckets correctly', () => {
    const a: Record<string, PartitionMeta> = {
      'task:2026-01': { hash: 10, updatedAt: 100 },
      'task:2026-02': { hash: 20, updatedAt: 200 },
      'task:2026-03': { hash: 30, updatedAt: 300 },
    };
    const b: Record<string, PartitionMeta> = {
      'task:2026-02': { hash: 99, updatedAt: 250 },
      'task:2026-03': { hash: 30, updatedAt: 300 },
      'task:2026-04': { hash: 40, updatedAt: 400 },
    };
    const result = metadataDiff(a, b);
    expect(result.aOnly).toEqual(['task:2026-01']);
    expect(result.bOnly).toEqual(['task:2026-04']);
    expect(result.mismatched).toEqual(['task:2026-02']);
  });

  it('treats partitions with same hash but different timestamps as matching', () => {
    const a: Record<string, PartitionMeta> = {
      'note:p1': { hash: 42, updatedAt: 100 },
    };
    const b: Record<string, PartitionMeta> = {
      'note:p1': { hash: 42, updatedAt: 999 },
    };
    const result = metadataDiff(a, b);
    expect(result.mismatched).toEqual([]);
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
  });

  it('handles one side being empty', () => {
    const a: Record<string, PartitionMeta> = {
      'task:p1': { hash: 1, updatedAt: 10 },
      'task:p2': { hash: 2, updatedAt: 20 },
    };
    const result = metadataDiff(a, {});
    expect(result.aOnly).toEqual(['task:p1', 'task:p2']);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });

  it('handles both sides empty', () => {
    const result = metadataDiff({}, {});
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });
});

// ── Stale Check ─────────────────────────────────────────────────────
describe('Stale Check', () => {
  it('returns false when metadata is unchanged', () => {
    const meta: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    expect(isStale(meta, meta, ['task:p1'])).toBe(false);
  });

  it('detects hash change as stale', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 999, updatedAt: 1000 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('detects timestamp change as stale', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 2000 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('detects partition added after snapshot as stale', () => {
    const before: Record<string, PartitionMeta> = {};
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('detects partition removed after snapshot as stale', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const after: Record<string, PartitionMeta> = {};
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('only checks the specified entity keys', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
      'task:p2': { hash: 200, updatedAt: 2000 },
    };
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
      'task:p2': { hash: 999, updatedAt: 9999 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(false);
    expect(isStale(before, after, ['task:p2'])).toBe(true);
  });
});

// ── Sync Apply ──────────────────────────────────────────────────────
describe('Sync Apply', () => {
  it('merges entities from both sides, keeping the winning version', () => {
    const aEntities: SyncEntity[] = [
      { id: 'e1', name: 'A-version' },
      { id: 'e2', name: 'shared' },
    ];
    const bEntities: SyncEntity[] = [
      { id: 'e1', name: 'B-version' },
      { id: 'e3', name: 'B-only' },
    ];
    const aMeta: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'A' },
      e2: { updatedAt: 100, version: 1, device: 'A' },
    };
    const bMeta: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'B' },
      e3: { updatedAt: 300, version: 1, device: 'B' },
    };

    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(3);
    const e1 = result.merged.find((e: SyncEntity) => e.id === 'e1');
    expect(e1?.name).toBe('A-version');
    expect(result.merged.find((e: SyncEntity) => e.id === 'e3')?.name).toBe('B-only');
    expect(result.conflictsResolved).toBeGreaterThan(0);
  });

  it('removes deleted entities from merged output', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', name: 'alive' }];
    const bEntities: SyncEntity[] = [];
    const aMeta: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const bMeta: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'B', deleted: true },
    };

    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(0);
    expect(result.deletedIds).toContain('e1');
  });

  it('includes a-only and b-only entities in the merge', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', val: 1 }];
    const bEntities: SyncEntity[] = [{ id: 'e2', val: 2 }];
    const aMeta: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const bMeta: EntityMetadataMap = {
      e2: { updatedAt: 100, version: 1, device: 'B' },
    };

    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(2);
    expect(result.conflictsResolved).toBe(0);
  });

  describe('recomputeMetadata', () => {
    it('produces consistent hash for the same content', () => {
      const content = serialize([{ id: 'e1', name: 'test' }]);
      const m1 = recomputeMetadata(content, 500);
      const m2 = recomputeMetadata(content, 500);
      expect(m1.hash).toBe(m2.hash);
      expect(m1.updatedAt).toBe(500);
    });

    it('produces different hash for different content', () => {
      const c1 = serialize([{ id: 'e1' }]);
      const c2 = serialize([{ id: 'e2' }]);
      const m1 = recomputeMetadata(c1, 100);
      const m2 = recomputeMetadata(c2, 100);
      expect(m1.hash).not.toBe(m2.hash);
    });
  });
});

// ── Sync Scheduler ──────────────────────────────────────────────────
describe('Sync Scheduler', () => {
  it('starts with zero pending tasks', () => {
    const sched = createSyncScheduler();
    expect(sched.pending()).toBe(0);
  });

  it('enqueues and dequeues tasks via flush', () => {
    const sched = createSyncScheduler();
    sched.schedule('store-to-local', 'task:2026-03');
    sched.schedule('local-to-cloud', 'note:2026-01');
    expect(sched.pending()).toBe(2);

    const tasks = sched.flush();
    expect(tasks).toHaveLength(2);
    expect(sched.pending()).toBe(0);
  });

  it('deduplicates same direction + entityKey pair', () => {
    const sched = createSyncScheduler();
    sched.schedule('store-to-local', 'task:p1');
    sched.schedule('store-to-local', 'task:p1');
    sched.schedule('store-to-local', 'task:p1');
    expect(sched.pending()).toBe(1);

    const tasks = sched.flush();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({ direction: 'store-to-local', entityKey: 'task:p1' });
  });

  it('does not deduplicate different directions for same key', () => {
    const sched = createSyncScheduler();
    sched.schedule('store-to-local', 'task:p1');
    sched.schedule('local-to-cloud', 'task:p1');
    expect(sched.pending()).toBe(2);
  });

  it('flush clears the queue for re-use', () => {
    const sched = createSyncScheduler();
    sched.schedule('store-to-local', 'key1');
    sched.flush();
    sched.schedule('local-to-cloud', 'key2');
    const tasks = sched.flush();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].entityKey).toBe('key2');
  });
});

// ── End-to-End Sync Flow ────────────────────────────────────────────
describe('End-to-End Sync Flow', () => {
  it('full flow: dirty detection → metadata diff → deep diff → merge → recompute → stale check', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('task:2026-03');
    expect(tracker.isDirty('task:2026-03')).toBe(true);

    const scheduler = createSyncScheduler();
    for (const key of tracker.getDirtyPartitions()) {
      scheduler.schedule('store-to-local', key);
    }
    expect(scheduler.pending()).toBe(1);

    const tasks = scheduler.flush();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].entityKey).toBe('task:2026-03');

    const storeMeta: Record<string, PartitionMeta> = {
      'task:2026-03': { hash: 999, updatedAt: 500 },
    };
    const localMeta: Record<string, PartitionMeta> = {
      'task:2026-03': { hash: 111, updatedAt: 300 },
    };
    const mdResult = metadataDiff(storeMeta, localMeta);
    expect(mdResult.mismatched).toContain('task:2026-03');

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
    expect(ddResult.oneWayCopy).toBeUndefined();

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
    const mergedE1 = mergeResult.merged.find((e: SyncEntity) => e.id === 'e1');
    expect(mergedE1?.title).toBe('Store E1 v2');
    const mergedE2 = mergeResult.merged.find((e: SyncEntity) => e.id === 'e2');
    expect(mergedE2?.title).toBe('Local E2 updated');
    expect(mergeResult.conflictsResolved).toBe(2);

    const mergedContent = serialize(mergeResult.merged);
    const newMeta = recomputeMetadata(mergedContent, 500);
    expect(newMeta.hash).toBeTypeOf('number');
    expect(newMeta.updatedAt).toBe(500);

    const staleResult = isStale(storeMeta, storeMeta, ['task:2026-03']);
    expect(staleResult).toBe(false);

    tracker.clear('task:2026-03');
    expect(tracker.isDirty('task:2026-03')).toBe(false);
  });

  it('skips write-back when stale is detected during sync', () => {
    const storeBefore: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const storeAfter: Record<string, PartitionMeta> = {
      'task:p1': { hash: 777, updatedAt: 2000 },
    };
    expect(isStale(storeBefore, storeAfter, ['task:p1'])).toBe(true);
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

    for (const key of tracker.getDirtyPartitions()) {
      scheduler.schedule('store-to-local', key);
      scheduler.schedule('store-to-local', key);
    }
    expect(scheduler.pending()).toBe(3);
  });
});
