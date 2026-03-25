import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import type { Tenant } from '@strata/adapter';
import { saveAllIndexes } from '@strata/persistence';
import { createStore } from '@strata/store';
import { hydrateFromCloud, syncBetween } from '@strata/sync';

const tenant: Tenant = { id: 't1', name: 'T', meta: { bucket: 'b' }, createdAt: new Date(), updatedAt: new Date() };

function makePartitionBlob(entityName: string, entities: Record<string, unknown>, tombstones: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  };
}

describe('hydrateFromCloud', () => {
  it('loads cloud partitions into store via local adapter', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.abc', name: 'Test', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await cloudAdapter.write(tenant, 'task._', makePartitionBlob('task', { 'task._.abc': entity }));
    await saveAllIndexes(cloudAdapter, tenant, {
      task: { '_': { hash: 111, count: 1, updatedAt: 1000 } },
    });

    const result = await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], tenant);

    expect(result).toEqual(['task']);
    expect(store.getEntity('task._', 'task._.abc')).toEqual(entity);
  });

  it('writes cloud blobs to local adapter', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.abc', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const blob = makePartitionBlob('task', { 'task._.abc': entity });
    await cloudAdapter.write(tenant, 'task._', blob);
    await saveAllIndexes(cloudAdapter, tenant, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });

    await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], tenant);

    const localBlob = await localAdapter.read(tenant, 'task._');
    expect(localBlob).not.toBeNull();
  });

  it('restores tombstones during hydration', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const tombstoneHlc = { timestamp: 999, counter: 0, nodeId: 'n1' };
    const blob = makePartitionBlob('task', {}, { 'task._.deleted1': tombstoneHlc });
    await cloudAdapter.write(tenant, 'task._', blob);
    await saveAllIndexes(cloudAdapter, tenant, {
      task: { '_': { hash: 222, count: 1, updatedAt: 1000 } },
    });

    await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], tenant);

    const tombstones = store.getTombstones('task._');
    expect(tombstones.get('task._.deleted1')).toEqual(tombstoneHlc);
  });

  it('handles cloud partition where blob read returns null', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    await saveAllIndexes(cloudAdapter, tenant, {
      task: { '_': { hash: 111, count: 1, updatedAt: 1000 } },
    });

    const result = await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], tenant);

    expect(result).toEqual(['task']);
    const localBlob = await localAdapter.read(tenant, 'task._');
    expect(localBlob).toBeNull();
  });

  it('returns empty when no cloud partitions exist', async () => {
    const cloudAdapter = createMemoryBlobAdapter();
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const result = await hydrateFromCloud(cloudAdapter, localAdapter, store, ['task'], undefined);
    expect(result).toEqual(['task']);
  });
});

describe('syncBetween as hydrate from local', () => {
  it('loads local partitions into store', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.abc', name: 'Test', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await localAdapter.write(undefined, 'task._', makePartitionBlob('task', { 'task._.abc': entity }));
    await saveAllIndexes(localAdapter, undefined, {
      task: { '_': { hash: 111, count: 1, updatedAt: 1000 } },
    });

    const result = await syncBetween(localAdapter, store, store, ['task'], undefined);

    expect(result.hydratedEntityNames).toEqual(['task']);
    expect(store.getEntity('task._', 'task._.abc')).toEqual(entity);
  });

  it('handles entity type with no partitions', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const store = createStore();

    const result = await syncBetween(localAdapter, store, store, ['task'], undefined);
    expect(result.hydratedEntityNames).toEqual(['task']);
  });
});
