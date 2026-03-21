import { describe, it, expect } from 'vitest';
import { createSyncScheduler } from '../../../src/sync/index.js';

describe('Integration: sync-scheduler', () => {
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
