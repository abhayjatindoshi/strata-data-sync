import { describe, it, expect } from 'vitest';
import { createDirtyTracker } from '@strata/sync';

describe('createDirtyTracker', () => {
  it('starts not dirty', () => {
    const tracker = createDirtyTracker();
    expect(tracker.isDirty).toBe(false);
  });

  it('markDirty sets isDirty to true', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty();
    expect(tracker.isDirty).toBe(true);
  });

  it('clearDirty sets isDirty to false', () => {
    const tracker = createDirtyTracker();
    tracker.markDirty();
    tracker.clearDirty();
    expect(tracker.isDirty).toBe(false);
  });

  it('isDirty$ emits initial false', () => {
    const tracker = createDirtyTracker();
    const values: boolean[] = [];
    const sub = tracker.isDirty$.subscribe(v => values.push(v));

    expect(values).toEqual([false]);
    sub.unsubscribe();
  });

  it('isDirty$ emits on state change', () => {
    const tracker = createDirtyTracker();
    const values: boolean[] = [];
    const sub = tracker.isDirty$.subscribe(v => values.push(v));

    tracker.markDirty();
    tracker.clearDirty();

    expect(values).toEqual([false, true, false]);
    sub.unsubscribe();
  });

  it('isDirty$ uses distinctUntilChanged — no duplicate emissions', () => {
    const tracker = createDirtyTracker();
    const values: boolean[] = [];
    const sub = tracker.isDirty$.subscribe(v => values.push(v));

    tracker.markDirty();
    tracker.markDirty();
    tracker.markDirty();
    tracker.clearDirty();
    tracker.clearDirty();

    expect(values).toEqual([false, true, false]);
    sub.unsubscribe();
  });
});
