import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { serialize } from '@strata/persistence';
import { savePartitionIndex } from '@strata/persistence';
import { createStore } from '@strata/store';
import { hydrateFromCloud, hydrateFromLocal } from '@strata/sync';

function makePartitionBlob(entityName: string, entities: Record<string, unknown>, tombstones: Record<string, unknown> = {}): Uint8Array {
  return serialize({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

describe('hydrateFromCloud', () => {
  it('loads cloud partitions into store via local adapter', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.abc', name: 'Test', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await cloudAdapter.write({ bucket: 'b' }, 'task._', makePartitionBlob('task', { 'task._.abc': entity }));
    await savePartitionIndex(cloudAdapter, { bucket: 'b' }, 'task', {
      '_': { hash: 111, count: 1, updatedAt: 1000 },
    });

    const result = await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], { bucket: 'b' });

    expect(result).toEqual(['task']);
    expect(store.get('task._', 'task._.abc')).toEqual(entity);
  });

  it('writes cloud blobs to local adapter', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const blob = makePartitionBlob('task', { 'task._.abc': { id: 'task._.abc' } });
    await cloudAdapter.write({ bucket: 'b' }, 'task._', blob);
    await savePartitionIndex(cloudAdapter, { bucket: 'b' }, 'task', {
      '_': { hash: 111, count: 1, updatedAt: 1000 },
    });

    await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], { bucket: 'b' });

    const localBlob = await localAdapter.read(undefined, 'task._');
    expect(localBlob).not.toBeNull();
  });

  it('restores tombstones during hydration', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const tombstoneHlc = { timestamp: 999, counter: 0, nodeId: 'n1' };
    const blob = makePartitionBlob('task', {}, { 'task._.deleted1': tombstoneHlc });
    await cloudAdapter.write({ bucket: 'b' }, 'task._', blob);
    await savePartitionIndex(cloudAdapter, { bucket: 'b' }, 'task', {
      '_': { hash: 222, count: 1, updatedAt: 1000 },
    });

    await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], { bucket: 'b' });

    const tombstones = store.getTombstones('task._');
    expect(tombstones.get('task._.deleted1')).toEqual(tombstoneHlc);
  });

  it('returns empty when no cloud partitions exist', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const result = await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], undefined);
    expect(result).toEqual(['task']);
  });
});

describe('hydrateFromLocal', () => {
  it('loads local partitions into store', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.abc', name: 'Test', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await localAdapter.write(undefined, 'task._', makePartitionBlob('task', { 'task._.abc': entity }));
    await savePartitionIndex(localAdapter, undefined, 'task', {
      '_': { hash: 111, count: 1, updatedAt: 1000 },
    });

    const result = await hydrateFromLocal(localAdapter, store, ['task']);

    expect(result).toEqual(['task']);
    expect(store.get('task._', 'task._.abc')).toEqual(entity);
  });

  it('restores tombstones from local blobs', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const tombstoneHlc = { timestamp: 999, counter: 0, nodeId: 'n1' };
    const blob = makePartitionBlob('task', {}, { 'task._.deleted1': tombstoneHlc });
    await localAdapter.write(undefined, 'task._', blob);
    await savePartitionIndex(localAdapter, undefined, 'task', {
      '_': { hash: 222, count: 1, updatedAt: 1000 },
    });

    await hydrateFromLocal(localAdapter, store, ['task']);

    const tombstones = store.getTombstones('task._');
    expect(tombstones.get('task._.deleted1')).toEqual(tombstoneHlc);
  });

  it('handles entity type with no partitions', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const result = await hydrateFromLocal(localAdapter, store, ['task']);
    expect(result).toEqual(['task']);
  });
});
