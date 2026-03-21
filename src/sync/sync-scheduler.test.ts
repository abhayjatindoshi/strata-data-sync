import { describe, it, expect } from 'vitest';
import { createSyncScheduler } from './sync-scheduler.js';

describe('createSyncScheduler', () => {
  it('starts with zero pending', () => {
    const scheduler = createSyncScheduler();
    expect(scheduler.pending()).toBe(0);
  });

  it('schedule adds a task', () => {
    const scheduler = createSyncScheduler();
    scheduler.schedule('store-to-local', 'Txn.2025');
    expect(scheduler.pending()).toBe(1);
  });

  it('deduplicates same direction+entityKey', () => {
    const scheduler = createSyncScheduler();
    scheduler.schedule('store-to-local', 'Txn.2025');
    scheduler.schedule('store-to-local', 'Txn.2025');
    expect(scheduler.pending()).toBe(1);
  });

  it('different directions are separate tasks', () => {
    const scheduler = createSyncScheduler();
    scheduler.schedule('store-to-local', 'Txn.2025');
    scheduler.schedule('local-to-cloud', 'Txn.2025');
    expect(scheduler.pending()).toBe(2);
  });

  it('different entityKeys are separate tasks', () => {
    const scheduler = createSyncScheduler();
    scheduler.schedule('store-to-local', 'Txn.2024');
    scheduler.schedule('store-to-local', 'Txn.2025');
    expect(scheduler.pending()).toBe(2);
  });

  it('flush returns all tasks and clears queue', () => {
    const scheduler = createSyncScheduler();
    scheduler.schedule('store-to-local', 'Txn.2025');
    scheduler.schedule('local-to-cloud', 'Acc.main');
    const tasks = scheduler.flush();
    expect(tasks).toHaveLength(2);
    expect(scheduler.pending()).toBe(0);
  });

  it('flush returns empty array when no tasks', () => {
    const scheduler = createSyncScheduler();
    expect(scheduler.flush()).toEqual([]);
  });
});
