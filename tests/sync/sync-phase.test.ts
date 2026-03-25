import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import type { PartitionIndex } from '@strata/persistence';
import { serialize } from '@strata/persistence';
import { syncMergePhase, updateIndexesAfterSync } from '@strata/sync';

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

describe('syncMergePhase', () => {
  it('skips merge when local blob is missing', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();

    // Cloud has the blob, local does not
    await cloudAdapter.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    }));

    const results = await syncMergePhase(
      localAdapter, cloudAdapter, undefined, 'task', ['_'],
    );

    expect(results).toHaveLength(0);
  });

  it('skips merge when cloud blob is missing', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();

    // Local has the blob, cloud does not
    await localAdapter.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    }));

    const results = await syncMergePhase(
      localAdapter, cloudAdapter, undefined, 'task', ['_'],
    );

    expect(results).toHaveLength(0);
  });
});

describe('updateIndexesAfterSync', () => {
  it('skips partitions where blob does not exist', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const localIndex: PartitionIndex = {
      '_': { hash: 111, count: 1, updatedAt: 1000 },
    };
    const cloudIndex: PartitionIndex = {
      '_': { hash: 222, count: 1, updatedAt: 1000 },
    };

    // No blobs written — the partition key '_' has no blob
    const { updatedLocal, updatedCloud } = await updateIndexesAfterSync(
      localAdapter, undefined, 'task',
      localIndex, cloudIndex, ['_', 'missing-key'],
    );

    // Should not throw; original entries preserved for missing blobs
    expect(updatedLocal['_'].hash).toBe(111);
    expect(updatedCloud['_'].hash).toBe(222);
  });

  it('updates indexes for partitions with existing blobs', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const entity = {
      id: 'task._.a1', name: 'Test',
      hlc: { timestamp: 2000, counter: 0, nodeId: 'n1' },
    };
    await localAdapter.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.a1': entity,
    }));

    const localIndex: PartitionIndex = {};
    const cloudIndex: PartitionIndex = {};

    const { updatedLocal, updatedCloud } = await updateIndexesAfterSync(
      localAdapter, undefined, 'task',
      localIndex, cloudIndex, ['_'],
    );

    expect(updatedLocal['_']).toBeDefined();
    expect(updatedLocal['_'].hash).toBe(updatedCloud['_'].hash);
    expect(updatedLocal['_'].count).toBe(1);
  });
});
