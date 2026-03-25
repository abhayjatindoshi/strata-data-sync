import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { createStore } from '@strata/store';
import { flushPartition, loadPartitionFromAdapter } from '@strata/store/flush';
import type { Hlc } from '@strata/hlc';

describe('flush with tombstones', () => {
  it('flushPartition includes tombstones in blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1',
      hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });

    const tombstoneHlc: Hlc = { timestamp: Date.now() - 1000, counter: 0, nodeId: 'n1' };
    store.setTombstone('task._', 'task._.deleted1', tombstoneHlc);

    await flushPartition(adapter, undefined, store, 'task._');

    const data = await adapter.read(undefined, 'task._') as Record<string, unknown>;
    expect(data).not.toBeNull();
    const deleted = data['deleted'] as Record<string, Record<string, Hlc>>;
    expect(deleted['task']['task._.deleted1']).toEqual(tombstoneHlc);
  });

  it('flushPartition purges stale tombstones', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    const now = Date.now();
    const staleHlc: Hlc = { timestamp: 1, counter: 0, nodeId: 'n1' };
    const freshHlc: Hlc = { timestamp: now - 1000, counter: 0, nodeId: 'n1' };

    store.setTombstone('task._', 'task._.old', staleHlc);
    store.setTombstone('task._', 'task._.new', freshHlc);
    store.setEntity('task._', 'task._.alive', { id: 'task._.alive' });

    await flushPartition(adapter, undefined, store, 'task._');

    const data = await adapter.read(undefined, 'task._') as Record<string, unknown>;
    const deleted = data['deleted'] as Record<string, Record<string, Hlc>>;
    expect(deleted['task']['task._.old']).toBeUndefined();
    expect(deleted['task']['task._.new']).toEqual(freshHlc);
  });
});

describe('loadPartitionFromAdapter', () => {
  it('loads entities from blob into map', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.a1', name: 'Test' };
    const blob = {
      task: { 'task._.a1': entity },
      deleted: { task: {} },
    };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(result.get('task._.a1')).toEqual(entity);
  });

  it('restores tombstones from blob deleted section', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    const tombstoneHlc: Hlc = { timestamp: 999, counter: 0, nodeId: 'n1' };
    const blob = {
      task: {},
      deleted: { task: { 'task._.del1': tombstoneHlc } },
    };
    await adapter.write(undefined, 'task._', blob);

    await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    const tombstones = store.getTombstones('task._');
    expect(tombstones.get('task._.del1')).toEqual(tombstoneHlc);
  });

  it('returns empty map when blob does not exist', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });
});
