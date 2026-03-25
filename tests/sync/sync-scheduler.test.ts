import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { serialize } from '@strata/persistence';
import { saveAllIndexes } from '@strata/persistence';
import { createStore } from '@strata/store';
import { createSyncLock, createSyncScheduler, syncNow } from '@strata/sync';

function makePartitionBlob(entityName: string, entities: Record<string, unknown>, tombstones: Record<string, unknown> = {}): Uint8Array {
  return ({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

describe('createSyncScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start begins periodic timers', () => {
    vi.useFakeTimers();
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
      { localFlushIntervalMs: 100, cloudSyncIntervalMs: 500 },
    );

    scheduler.start();
    expect(lock.isRunning()).toBe(false);
    scheduler.stop();
  });

  it('stop clears timers', () => {
    vi.useFakeTimers();
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
      { localFlushIntervalMs: 100, cloudSyncIntervalMs: 500 },
    );

    scheduler.start();
    scheduler.stop();

    vi.advanceTimersByTime(1000);
    expect(lock.isRunning()).toBe(false);
  });

  it('dispose stops timers and drains lock', async () => {
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
    );

    scheduler.start();
    await scheduler.dispose();
    // After dispose, lock should be disposed
    await expect(
      lock.enqueue('memory-to-local', 'memory-to-local', async () => {}),
    ).rejects.toThrow('disposed');
  });
});

describe('createSyncScheduler — timer callbacks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('local flush interval enqueues memory-to-local on tick', async () => {
    vi.useFakeTimers();
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();
    const enqueueSpy = vi.spyOn(lock, 'enqueue');

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
      { localFlushIntervalMs: 50, cloudSyncIntervalMs: 100000 },
    );

    scheduler.start();
    vi.advanceTimersByTime(50);

    expect(enqueueSpy).toHaveBeenCalledWith(
      'memory-to-local', 'memory-to-local', expect.any(Function),
    );

    scheduler.stop();
    enqueueSpy.mockRestore();
  });

  it('cloud sync interval enqueues local-to-cloud on tick', async () => {
    vi.useFakeTimers();
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();
    const enqueueSpy = vi.spyOn(lock, 'enqueue');

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
      { localFlushIntervalMs: 100000, cloudSyncIntervalMs: 50 },
    );

    scheduler.start();
    vi.advanceTimersByTime(50);

    expect(enqueueSpy).toHaveBeenCalledWith(
      'local-to-cloud', 'local-to-cloud', expect.any(Function),
    );

    scheduler.stop();
    enqueueSpy.mockRestore();
  });

  it('catches local flush errors without crashing', async () => {
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    store.setEntity('bad._', 'bad._.1', {});
    localAdapter.write = async () => { throw new Error('write failed'); };

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
      { localFlushIntervalMs: 20, cloudSyncIntervalMs: 100000 },
    );

    scheduler.start();
    // Wait for the interval to fire and the enqueued operation to fail
    await new Promise(r => setTimeout(r, 100));
    await lock.drain().catch(() => {});
    scheduler.stop();
  });

  it('catches cloud sync errors without crashing', async () => {
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    cloudAdapter.read = async () => { throw new Error('network failed'); };

    const scheduler = createSyncScheduler(
      lock, localAdapter, cloudAdapter, store, ['task'], undefined,
      { localFlushIntervalMs: 100000, cloudSyncIntervalMs: 20 },
    );

    scheduler.start();
    await new Promise(r => setTimeout(r, 100));
    await lock.drain().catch(() => {});
    scheduler.stop();
  });
});

describe('syncNow', () => {
  it('flushes local then syncs with cloud', async () => {
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', name: 'T1',
      hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });

    await syncNow(lock, localAdapter, cloudAdapter, store, ['task'], undefined);

    // After sync, no errors means both phases completed
    expect(lock.isRunning()).toBe(false);
  });

  it('loads cloud-only partitions into store during sync', async () => {
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const cloudEntity = {
      id: 'task._.c1', name: 'CloudOnly',
      hlc: { timestamp: 1000, counter: 0, nodeId: 'cloud' },
    };

    await cloudAdapter.write(undefined, 'task._',
      makePartitionBlob('task', { 'task._.c1': cloudEntity }));
    await saveAllIndexes(cloudAdapter, undefined, {
      task: { '_': { hash: 333, count: 1, updatedAt: 1000 } },
    });

    await syncNow(lock, localAdapter, cloudAdapter, store, ['task'], undefined);

    expect(store.getEntity('task._', 'task._.c1')).toBeDefined();
  });

  it('processes diverged partitions during cloud sync', async () => {
    const lock = createSyncLock();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const localEntity = {
      id: 'task._.a1', name: 'LocalVer',
      hlc: { timestamp: 2000, counter: 0, nodeId: 'local' },
    };
    const cloudEntity = {
      id: 'task._.a1', name: 'CloudVer',
      hlc: { timestamp: 1000, counter: 0, nodeId: 'cloud' },
    };

    await localAdapter.write(undefined, 'task._',
      makePartitionBlob('task', { 'task._.a1': localEntity }));
    await saveAllIndexes(localAdapter, undefined, {
      task: { '_': { hash: 111, count: 1, updatedAt: 1000 } },
    });

    await cloudAdapter.write(undefined, 'task._',
      makePartitionBlob('task', { 'task._.a1': cloudEntity }));
    await saveAllIndexes(cloudAdapter, undefined, {
      task: { '_': { hash: 222, count: 1, updatedAt: 1000 } },
    });

    await syncNow(lock, localAdapter, cloudAdapter, store, ['task'], undefined);
    expect(lock.isRunning()).toBe(false);
  });
});
