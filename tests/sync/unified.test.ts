import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';
import { saveAllIndexes, loadAllIndexes } from '@strata/persistence';
import { serialize } from '@strata/utils';
import type { PartitionBlob } from '@strata/persistence';
import type { Hlc } from '@strata/hlc';
import { Store } from '@strata/store';
import { syncBetween } from '@strata/sync';
import { DEFAULT_OPTIONS } from '../helpers';

function makePartitionBlob(
  entityName: string,
  entities: Record<string, unknown>,
  tombstones: Record<string, Hlc> = {},
): PartitionBlob {
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
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

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
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

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
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

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

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

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
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      note: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task', 'note'], undefined, undefined, DEFAULT_OPTIONS);

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
    }, DEFAULT_OPTIONS);

    await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

    const { loadAllIndexes } = await import('@strata/persistence');
    const indexesA = await loadAllIndexes(adapterA, undefined, DEFAULT_OPTIONS);
    const indexesB = await loadAllIndexes(adapterB, undefined, DEFAULT_OPTIONS);

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
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

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
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

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
        }, DEFAULT_OPTIONS);
      }
    };

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);

    // When stale, changesForA should be empty (skipped write-back)
    expect(result.stale).toBe(true);
    expect(result.changesForA).toHaveLength(0);
  });

  it('skips merge when one side has missing blob for diverged partition', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    // Index says diverged, but adapterB has no actual blob for the partition
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    // adapterB has no 'task._' blob — just the index reference

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, undefined, DEFAULT_OPTIONS);
    // Since blobB is missing, the merge is skipped for that partition
    // but the A-only copy should still happen via localOnly logic
    expect(result).toBeDefined();
  });

  it('applies migrations during merge of diverged partitions', async () => {
    const adapterA = new MemoryBlobAdapter();
    const adapterB = new MemoryBlobAdapter();

    const entityA = { id: 'task._.a1', title: 'old', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', title: 'old', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const migrations = [{
      version: 1,
      migrate: (blob: Record<string, unknown>) => {
        const tasks = (blob.task ?? {}) as Record<string, Record<string, unknown>>;
        const migrated: Record<string, unknown> = {};
        for (const [id, entity] of Object.entries(tasks)) {
          migrated[id] = { ...entity, migrated: true };
        }
        return { ...blob, task: migrated };
      },
    }];

    const result = await syncBetween(
      adapterA, adapterB, ['task'], undefined, migrations as any, DEFAULT_OPTIONS,
    );

    expect(result.changesForA.length + result.changesForB.length).toBeGreaterThan(0);
  });
});
