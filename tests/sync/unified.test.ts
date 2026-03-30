import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';
import { serialize, saveAllIndexes, loadAllIndexes } from '@strata/persistence';
import { Store } from '@strata/store';
import { syncBetween } from '@strata/sync';

function makePartitionBlob(
  entityName: string,
  entities: Record<string, unknown>,
  tombstones: Record<string, unknown> = {},
): Uint8Array {
  return ({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

describe('syncBetween', () => {
  it('copies A-only partitions to B', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined);

    expect(result.changesForB.length).toBe(1);
    expect(result.changesForB[0].key).toBe('task._');

    const blobOnB = await adapterB.read(undefined, 'task._');
    expect(blobOnB).not.toBeNull();
  });

  it('copies B-only partitions to A', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    const entity = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entity }));
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    });

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined);

    expect(result.changesForA.length).toBe(1);
    expect(result.changesForA[0].key).toBe('task._');
    expect(result.changesForA[0].updatedIds).toContain('task._.b1');

    const blobOnA = await adapterA.read(undefined, 'task._');
    expect(blobOnA).not.toBeNull();
  });

  it('merges diverged partitions', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

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

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined);

    // Merged blob written to both
    expect(result.changesForA.length).toBe(1);
    expect(result.changesForB.length).toBe(1);

    const blobA = await adapterA.read(undefined, 'task._');
    const blobB = await adapterB.read(undefined, 'task._');
    expect(blobA).toEqual(blobB);
  });

  it('returns empty result when no data on either side', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined);

    expect(result.changesForA).toHaveLength(0);
    expect(result.changesForB).toHaveLength(0);
    expect(result.stale).toBe(false);
    expect(result.maxHlc).toBeUndefined();
  });

  it('handles multiple entity types', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

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

    const result = await syncBetween(adapterA, adapterB, ['task', 'note'], undefined);

    expect(result.changesForB.length).toBe(1);
    expect(result.changesForA.length).toBe(1);
  });

  it('updates indexes on both adapters after sync', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    });

    await syncBetween(adapterA, adapterB, ['task'], undefined);

    const { loadAllIndexes } = await import('@strata/persistence');
    const indexesA = await loadAllIndexes(adapterA, undefined);
    const indexesB = await loadAllIndexes(adapterB, undefined);

    expect(indexesA['task']?.['_']).toBeDefined();
    expect(indexesB['task']?.['_']).toBeDefined();
    expect(indexesA['task']['_'].hash).toBe(indexesB['task']['_'].hash);
  });

  it('returns maxHlc from all processed entities', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 5000, counter: 3, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 5000 } },
    });

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined);

    expect(result.maxHlc).toBeDefined();
    expect(result.maxHlc!.timestamp).toBe(5000);
    expect(result.maxHlc!.counter).toBe(3);
  });

  it('detects stale state when adapterA is modified during sync', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    // Setup both sides with diverged data so merge produces applyToA
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

    // Intercept adapterB.write — when B is written (phase 2), modify A's indexes to simulate concurrent change
    const origWriteB = adapterB.write.bind(adapterB);
    let intercepted = false;
    adapterB.write = async (tenant, key, data) => {
      await origWriteB(tenant, key, data);
      if (!intercepted && key === 'task._') {
        intercepted = true;
        // Change A's index hash to simulate concurrent write to A
        await saveAllIndexes(adapterA, undefined, {
          task: { '_': { hash: 999, count: 5, deletedCount: 0, updatedAt: 9999 } },
        });
      }
    };

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined);

    // When stale, changesForA should be empty (skipped write-back)
    expect(result.stale).toBe(true);
    expect(result.changesForA).toHaveLength(0);
  });
});
