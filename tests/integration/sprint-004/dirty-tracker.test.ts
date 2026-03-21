import { describe, it, expect } from 'vitest';
import { createDirtyTracker } from '../../../src/sync/index.js';

describe('Integration: dirty-tracker', () => {
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
