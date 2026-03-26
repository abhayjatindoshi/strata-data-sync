import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@strata/store';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { flushPartition, flushAll, loadPartitionFromAdapter } from '@strata/store/flush';

describe('flushPartition', () => {
  it('writes partition blob to adapter', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.setEntity('transaction._', 'transaction._.abc', { id: 'transaction._.abc', amount: 100 });

    await flushPartition(adapter, undefined, store, 'transaction._');

    const data = await adapter.read(undefined, 'transaction._') as Record<string, unknown>;
    expect(data).not.toBeNull();
    expect(data).toHaveProperty('transaction');
    expect(data).toHaveProperty('deleted');
    const entities = data['transaction'] as Record<string, unknown>;
    expect(entities['transaction._.abc']).toEqual({ id: 'transaction._.abc', amount: 100 });
  });

  it('writes blob with correct key format', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.setEntity('task.2026-03', 'task.2026-03.xyz', { id: 'task.2026-03.xyz' });

    await flushPartition(adapter, undefined, store, 'task.2026-03');

    const data = await adapter.read(undefined, 'task.2026-03');
    expect(data).not.toBeNull();
  });

  it('writes empty entities when partition is empty', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.setEntity('task._', 'task._.a', {});
    store.deleteEntity('task._', 'task._.a');

    await flushPartition(adapter, undefined, store, 'task._');

    const data = await adapter.read(undefined, 'task._') as Record<string, unknown>;
    expect(data).not.toBeNull();
    const entities = data['task'] as Record<string, unknown>;
    expect(Object.keys(entities)).toHaveLength(0);
  });
});

describe('flushAll', () => {
  it('flushes all dirty partitions', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.setEntity('a._', 'a._.1', { id: 'a._.1' });
    store.setEntity('b._', 'b._.2', { id: 'b._.2' });

    await flushAll(adapter, undefined, store);

    expect(await adapter.read(undefined, 'a._')).not.toBeNull();
    expect(await adapter.read(undefined, 'b._')).not.toBeNull();
  });

  it('clears dirty flags after flush', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();
    store.setEntity('a._', 'a._.1', {});

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

    const blob = { task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } }, deleted: {} };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(result.get('task._.a1')).toEqual({ id: 'task._.a1', name: 'Test' });
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
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(store.getTombstones('task._').get('task._.d1')).toBeDefined();
  });
});
