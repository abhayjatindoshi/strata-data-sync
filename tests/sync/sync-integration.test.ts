import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import type { Tenant } from '@strata/adapter';
import type { PartitionIndex } from '@strata/persistence';
import type { Hlc } from '@strata/hlc';
import {
  syncMergePhase,
  updateIndexesAfterSync,
} from '@strata/sync';

const tenant: Tenant = { id: 'test', name: 'T', meta: { container: 'test' }, createdAt: new Date(), updatedAt: new Date() };
const entityName = 'task';

function makeBlob(
  entities: Record<string, unknown>,
  tombstones: Record<string, Hlc> = {},
): Record<string, unknown> {
  return {
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  };
}

describe('syncMergePhase', () => {
  it('merges all diverged partitions and writes to both adapters', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    const localBlob = makeBlob({
      'task.2026-01.a': {
        id: 'task.2026-01.a', value: 'local',
        hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
      },
    });
    const cloudBlob = makeBlob({
      'task.2026-01.b': {
        id: 'task.2026-01.b', value: 'cloud',
        hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' },
      },
    });

    await local.write(tenant, 'task.2026-01', localBlob);
    await cloud.write(tenant, 'task.2026-01', cloudBlob);

    const results = await syncMergePhase(
      local, cloud, tenant, entityName, ['2026-01'],
    );

    expect(results).toHaveLength(1);
    expect(results[0].partitionKey).toBe('2026-01');
    expect(results[0].entities['task.2026-01.a']).toBeDefined();
    expect(results[0].entities['task.2026-01.b']).toBeDefined();

    const localResult = await local.read(tenant, 'task.2026-01');
    const cloudResult = await cloud.read(tenant, 'task.2026-01');
    expect(localResult).toEqual(cloudResult);
  });

  it('skips partitions where a blob is missing', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    const localBlob = makeBlob({
      'task.2026-01.a': {
        id: 'task.2026-01.a',
        hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
      },
    });
    await local.write(tenant, 'task.2026-01', localBlob);

    const results = await syncMergePhase(
      local, cloud, tenant, entityName, ['2026-01'],
    );

    expect(results).toHaveLength(0);
  });

  it('processes multiple diverged partitions', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    await local.write(tenant, 'task.2026-01', makeBlob({
      'task.2026-01.a': {
        id: 'a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
      },
    }));
    await cloud.write(tenant, 'task.2026-01', makeBlob({
      'task.2026-01.b': {
        id: 'b', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' },
      },
    }));

    await local.write(tenant, 'task.2026-02', makeBlob({
      'task.2026-02.c': {
        id: 'c', hlc: { timestamp: 3000, counter: 0, nodeId: 'n1' },
      },
    }));
    await cloud.write(tenant, 'task.2026-02', makeBlob({
      'task.2026-02.d': {
        id: 'd', hlc: { timestamp: 4000, counter: 0, nodeId: 'n2' },
      },
    }));

    const results = await syncMergePhase(
      local, cloud, tenant, entityName, ['2026-01', '2026-02'],
    );

    expect(results).toHaveLength(2);
    expect(results[0].partitionKey).toBe('2026-01');
    expect(results[1].partitionKey).toBe('2026-02');
  });
});

describe('updateIndexesAfterSync', () => {
  it('recomputes hashes and persists both indexes', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    const blob = makeBlob({
      'task.2026-01.a': {
        id: 'task.2026-01.a',
        hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
      },
    });
    await local.write(tenant, 'task.2026-01', blob);

    const localIndex: PartitionIndex = {
      '2026-01': { hash: 111, count: 1, updatedAt: 1000 },
    };
    const cloudIndex: PartitionIndex = {
      '2026-01': { hash: 222, count: 1, updatedAt: 2000 },
    };

    const { updatedLocal, updatedCloud } = await updateIndexesAfterSync(
      local, tenant, entityName, localIndex, cloudIndex, ['2026-01'],
    );

    expect(updatedLocal['2026-01'].hash).toBe(updatedCloud['2026-01'].hash);
    expect(updatedLocal['2026-01'].count).toBe(1);
  });

  it('preserves unsynced partitions in indexes', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    const blob = makeBlob({
      'task.2026-02.x': {
        id: 'x', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
      },
    });
    await local.write(tenant, 'task.2026-02', blob);

    const localIndex: PartitionIndex = {
      '2026-01': { hash: 111, count: 5, updatedAt: 1000 },
      '2026-02': { hash: 222, count: 1, updatedAt: 2000 },
    };
    const cloudIndex: PartitionIndex = {
      '2026-01': { hash: 111, count: 5, updatedAt: 1000 },
      '2026-02': { hash: 333, count: 1, updatedAt: 3000 },
    };

    const { updatedLocal } = await updateIndexesAfterSync(
      local, tenant, entityName, localIndex, cloudIndex, ['2026-02'],
    );

    expect(updatedLocal['2026-01'].hash).toBe(111);
    expect(updatedLocal['2026-02'].hash).not.toBe(222);
  });
});
