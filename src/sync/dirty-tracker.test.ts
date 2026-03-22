import { describe, it, expect } from 'vitest';
import { createDirtyTracker } from './dirty-tracker';

describe('createDirtyTracker', () => {
  it('starts with version 0 and no dirty partitions', () => {
    const tracker = createDirtyTracker();
    expect(tracker.version()).toBe(0);
    expect(tracker.getDirtyPartitions()).toEqual([]);
  });

  it('markDirty adds partition and increments version', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('Txn.2025');
    expect(tracker.isDirty('Txn.2025')).toBe(true);
    expect(tracker.version()).toBe(1);
  });

  it('markDirty same partition increments version but deduplicates', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('Txn.2025');
    tracker.markDirty('Txn.2025');
    expect(tracker.getDirtyPartitions()).toEqual(['Txn.2025']);
    expect(tracker.version()).toBe(2);
  });

  it('getDirtyPartitions returns all dirty keys', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('Txn.2024');
    tracker.markDirty('Txn.2025');
    const dirty = tracker.getDirtyPartitions();
    expect(dirty).toHaveLength(2);
    expect(dirty).toContain('Txn.2024');
    expect(dirty).toContain('Txn.2025');
  });

  it('clear removes a single partition', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('Txn.2024');
    tracker.markDirty('Txn.2025');
    tracker.clear('Txn.2024');
    expect(tracker.isDirty('Txn.2024')).toBe(false);
    expect(tracker.isDirty('Txn.2025')).toBe(true);
  });

  it('clearAll removes all dirty partitions', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty('Txn.2024');
    tracker.markDirty('Txn.2025');
    tracker.clearAll();
    expect(tracker.getDirtyPartitions()).toEqual([]);
  });

  it('isDirty returns false for unknown partitions', () => {
    const tracker = createDirtyTracker();
    expect(tracker.isDirty('Txn.2025')).toBe(false);
  });
});
