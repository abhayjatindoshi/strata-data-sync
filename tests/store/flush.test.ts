import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@strata/store';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { deserialize } from '@strata/persistence';
import { flushPartition, flushAll, loadPartitionFromAdapter } from '@strata/store';
import { createFlushScheduler } from '@strata/store';

describe('flushPartition', () => {
  it('serializes partition to blob and writes to adapter', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('transaction._', 'transaction._.abc', { id: 'transaction._.abc', amount: 100 });

    await flushPartition(adapter, undefined, store, 'transaction._');

    const data = await adapter.read(undefined, 'transaction._');
    expect(data).not.toBeNull();
    const blob = deserialize<Record<string, unknown>>(data!);
    expect(blob).toHaveProperty('transaction');
    expect(blob).toHaveProperty('deleted');
    const entities = blob['transaction'] as Record<string, unknown>;
    expect(entities['transaction._.abc']).toEqual({ id: 'transaction._.abc', amount: 100 });
  });

  it('writes blob with correct key format', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('task.2026-03', 'task.2026-03.xyz', { id: 'task.2026-03.xyz' });

    await flushPartition(adapter, undefined, store, 'task.2026-03');

    const data = await adapter.read(undefined, 'task.2026-03');
    expect(data).not.toBeNull();
  });

  it('writes empty entities when partition is empty', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('task._', 'task._.a', {});
    store.delete('task._', 'task._.a');

    await flushPartition(adapter, undefined, store, 'task._');

    const data = await adapter.read(undefined, 'task._');
    expect(data).not.toBeNull();
    const blob = deserialize<Record<string, unknown>>(data!);
    const entities = blob['task'] as Record<string, unknown>;
    expect(Object.keys(entities)).toHaveLength(0);
  });
});

describe('flushAll', () => {
  it('flushes all dirty partitions', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('a._', 'a._.1', { id: 'a._.1' });
    store.set('b._', 'b._.2', { id: 'b._.2' });

    await flushAll(adapter, undefined, store);

    expect(await adapter.read(undefined, 'a._')).not.toBeNull();
    expect(await adapter.read(undefined, 'b._')).not.toBeNull();
  });

  it('clears dirty flags after flush', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('a._', 'a._.1', {});

    expect(store.getDirtyKeys().size).toBe(1);
    await flushAll(adapter, undefined, store);
    expect(store.getDirtyKeys().size).toBe(0);
  });

  it('does nothing when no dirty partitions', async () => {
    const adapter = createMemoryBlobAdapter();
    const spy = vi.spyOn(adapter, 'write');
    const store = createStore();

    await flushAll(adapter, undefined, store);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('loadPartitionFromAdapter', () => {
  it('loads entities from blob without deleted section', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    // Write a blob with entities but no 'deleted' key
    const blob = { task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } } };
    const data = new TextEncoder().encode(JSON.stringify(blob));
    await adapter.write(undefined, 'task._', data);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(result.get('task._.a1')).toEqual({ id: 'task._.a1', name: 'Test' });
    // No tombstones should be set
    expect(store.getTombstones('task._').size).toBe(0);
  });

  it('returns empty map when blob does not exist', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });

  it('loads entities and tombstones from blob with deleted section', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    const blob = {
      task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } },
      deleted: {
        task: { 'task._.d1': { timestamp: 999, counter: 0, nodeId: 'n1' } },
      },
    };
    const data = new TextEncoder().encode(JSON.stringify(blob));
    await adapter.write(undefined, 'task._', data);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(store.getTombstones('task._').get('task._.d1')).toBeDefined();
  });
});

describe('createFlushScheduler', () => {
  it('flush() forces immediate write', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('x._', 'x._.1', { id: 'x._.1' });

    const scheduler = createFlushScheduler(adapter, undefined, store);
    await scheduler.flush();

    expect(await adapter.read(undefined, 'x._')).not.toBeNull();
    expect(store.getDirtyKeys().size).toBe(0);
  });

  it('schedule() debounces writes', async () => {
    vi.useFakeTimers();
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('x._', 'x._.1', {});

    const scheduler = createFlushScheduler(adapter, undefined, store, { debounceMs: 100 });
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(await adapter.read(undefined, 'x._')).toBeNull();

    await vi.advanceTimersByTimeAsync(100);

    expect(await adapter.read(undefined, 'x._')).not.toBeNull();
    vi.useRealTimers();
  });

  it('flush() cancels pending timer', async () => {
    vi.useFakeTimers();
    const adapter = createMemoryBlobAdapter();
    const spy = vi.spyOn(adapter, 'write');
    const store = createStore();
    store.set('x._', 'x._.1', {});

    const scheduler = createFlushScheduler(adapter, undefined, store, { debounceMs: 1000 });
    scheduler.schedule();
    await scheduler.flush();

    expect(spy).toHaveBeenCalledTimes(2); // partition blob + partition index

    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('scheduled callback fires and flushes with real timers', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('x._', 'x._.1', { id: 'x._.1' });

    const scheduler = createFlushScheduler(adapter, undefined, store, { debounceMs: 10 });
    scheduler.schedule();

    await new Promise(r => setTimeout(r, 100));

    expect(await adapter.read(undefined, 'x._')).not.toBeNull();
    await scheduler.dispose();
  });

  it('scheduled callback catches flush errors gracefully', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('x._', 'x._.1', { id: 'x._.1' });

    const scheduler = createFlushScheduler(adapter, undefined, store, { debounceMs: 10 });
    // Sabotage adapter to make flushAll throw
    adapter.write = async () => { throw new Error('disk full'); };

    scheduler.schedule();
    // Wait for the timer to fire and the error to be caught
    await new Promise(r => setTimeout(r, 100));

    // Should not throw — error is caught internally
    await scheduler.dispose().catch(() => {});
  });

  it('dispose() clears pending timer and flushes', async () => {
    vi.useFakeTimers();
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('x._', 'x._.1', { id: 'x._.1' });

    const scheduler = createFlushScheduler(adapter, undefined, store, { debounceMs: 5000 });
    scheduler.schedule();

    // Dispose without waiting for timer
    await scheduler.dispose();

    expect(await adapter.read(undefined, 'x._')).not.toBeNull();
    expect(store.getDirtyKeys().size).toBe(0);
    vi.useRealTimers();
  });

  it('dispose() flushes dirty data and rejects further scheduling', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.set('x._', 'x._.1', {});

    const scheduler = createFlushScheduler(adapter, undefined, store);
    await scheduler.dispose();

    expect(await adapter.read(undefined, 'x._')).not.toBeNull();
    expect(store.getDirtyKeys().size).toBe(0);

    store.set('y._', 'y._.2', {});
    scheduler.schedule();
    // schedule should be a no-op after dispose
    expect(store.getDirtyKeys().size).toBe(1);
  });
});
