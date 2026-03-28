import { describe, it, expect } from 'vitest';
import { DirtyTracker } from '@strata/sync';

describe('DirtyTracker', () => {
  it('starts not dirty', () => {
    const tracker = new DirtyTracker();
    expect(tracker.isDirty).toBe(false);
  });

  it('markDirty sets isDirty to true', () => {
    const tracker = new DirtyTracker();
    tracker.markDirty();
    expect(tracker.isDirty).toBe(true);
  });

  it('clearDirty sets isDirty to false', () => {
    const tracker = new DirtyTracker();
    tracker.markDirty();
    tracker.clearDirty();
    expect(tracker.isDirty).toBe(false);
  });

  it('isDirty$ emits initial false', () => {
    const tracker = new DirtyTracker();
    const values: boolean[] = [];
    const sub = tracker.isDirty$.subscribe(v => values.push(v));

    expect(values).toEqual([false]);
    sub.unsubscribe();
  });

  it('isDirty$ emits on state change', () => {
    const tracker = new DirtyTracker();
    const values: boolean[] = [];
    const sub = tracker.isDirty$.subscribe(v => values.push(v));

    tracker.markDirty();
    tracker.clearDirty();

    expect(values).toEqual([false, true, false]);
    sub.unsubscribe();
  });

  it('isDirty$ uses distinctUntilChanged — no duplicate emissions', () => {
    const tracker = new DirtyTracker();
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
