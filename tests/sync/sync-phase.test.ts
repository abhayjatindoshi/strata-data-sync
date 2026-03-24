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
  return serialize({
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
    const cloudAdapter = createMemoryBlobAdapter();

    const localIndex: PartitionIndex = {
      '_': { hash: 111, count: 1, updatedAt: 1000 },
    };
    const cloudIndex: PartitionIndex = {
      '_': { hash: 222, count: 1, updatedAt: 1000 },
    };

    // No blobs written — the partition key '_' has no blob
    await updateIndexesAfterSync(
      localAdapter, cloudAdapter, undefined, 'task',
      localIndex, cloudIndex, ['_', 'missing-key'],
    );

    // Should not throw; indexes still saved (just without updates for missing blobs)
    const localData = await localAdapter.read(undefined, '__index.task');
    expect(localData).not.toBeNull();
  });

  it('updates indexes for partitions with existing blobs', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();

    const entity = {
      id: 'task._.a1', name: 'Test',
      hlc: { timestamp: 2000, counter: 0, nodeId: 'n1' },
    };
    await localAdapter.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.a1': entity,
    }));

    const localIndex: PartitionIndex = {};
    const cloudIndex: PartitionIndex = {};

    await updateIndexesAfterSync(
      localAdapter, cloudAdapter, undefined, 'task',
      localIndex, cloudIndex, ['_'],
    );

    const localData = await localAdapter.read(undefined, '__index.task');
    expect(localData).not.toBeNull();
    const cloudData = await cloudAdapter.read(undefined, '__index.task');
    expect(cloudData).not.toBeNull();
  });
});
