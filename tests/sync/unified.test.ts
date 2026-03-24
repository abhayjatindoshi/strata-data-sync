import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { serialize, saveAllIndexes } from '@strata/persistence';
import { createStore } from '@strata/store';
import { syncBetween } from '@strata/sync';

function makePartitionBlob(
  entityName: string,
  entities: Record<string, unknown>,
  tombstones: Record<string, unknown> = {},
): Uint8Array {
  return serialize({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

describe('syncBetween', () => {
  it('copies A-only partitions to B', async () => {
    const adapterA = createMemoryBlobAdapter();
    const adapterB = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });

    const result = await syncBetween(adapterA, adapterB, store, ['task'], undefined);

    expect(result.partitionsCopied).toBe(1);
    expect(result.partitionsMerged).toBe(0);
    expect(result.hydratedEntityNames).toEqual(['task']);

    const blobOnB = await adapterB.read(undefined, 'task._');
    expect(blobOnB).not.toBeNull();
  });

  it('copies B-only partitions to A', async () => {
    const adapterA = createMemoryBlobAdapter();
    const adapterB = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entity }));
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    });

    const result = await syncBetween(adapterA, adapterB, store, ['task'], undefined);

    expect(result.partitionsCopied).toBe(1);
    expect(store.get('task._', 'task._.b1')).toBeDefined();
  });

  it('merges diverged partitions', async () => {
    const adapterA = createMemoryBlobAdapter();
    const adapterB = createMemoryBlobAdapter();
    const store = createStore();

    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    });

    const result = await syncBetween(adapterA, adapterB, store, ['task'], undefined);

    expect(result.partitionsMerged).toBe(1);
    expect(store.get('task._', 'task._.a1')).toBeDefined();
    expect(store.get('task._', 'task._.b1')).toBeDefined();
  });

  it('returns empty result when no data on either side', async () => {
    const adapterA = createMemoryBlobAdapter();
    const adapterB = createMemoryBlobAdapter();
    const store = createStore();

    const result = await syncBetween(adapterA, adapterB, store, ['task'], undefined);

    expect(result.partitionsCopied).toBe(0);
    expect(result.partitionsMerged).toBe(0);
    expect(result.conflictsResolved).toBe(0);
    expect(result.hydratedEntityNames).toEqual(['task']);
  });

  it('handles multiple entity types', async () => {
    const adapterA = createMemoryBlobAdapter();
    const adapterB = createMemoryBlobAdapter();
    const store = createStore();

    const taskEntity = { id: 'task._.t1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const noteEntity = { id: 'note._.n1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.t1': taskEntity }));
    await adapterB.write(undefined, 'note._', makePartitionBlob('note', { 'note._.n1': noteEntity }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });
    await saveAllIndexes(adapterB, undefined, {
      note: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    });

    const result = await syncBetween(adapterA, adapterB, store, ['task', 'note'], undefined);

    expect(result.partitionsCopied).toBe(2);
    expect(result.hydratedEntityNames).toEqual(['task', 'note']);
  });

  it('updates indexes on both adapters after sync', async () => {
    const adapterA = createMemoryBlobAdapter();
    const adapterB = createMemoryBlobAdapter();
    const store = createStore();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });

    await syncBetween(adapterA, adapterB, store, ['task'], undefined);

    const { loadAllIndexes } = await import('@strata/persistence');
    const indexesA = await loadAllIndexes(adapterA, undefined);
    const indexesB = await loadAllIndexes(adapterB, undefined);

    expect(indexesA['task']?.['_']).toBeDefined();
    expect(indexesB['task']?.['_']).toBeDefined();
    expect(indexesA['task']['_'].hash).toBe(indexesB['task']['_'].hash);
  });
});
