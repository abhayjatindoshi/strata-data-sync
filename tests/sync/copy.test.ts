import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { serialize } from '@strata/persistence';
import {
  copyPartitionToCloud,
  copyPartitionToLocal,
  syncCopyPhase,
} from '@strata/sync';

const cloudMeta = { container: 'test' };
const entityName = 'task';

function makeBlob(data: Record<string, unknown>): Uint8Array {
  return serialize(data);
}

describe('copyPartitionToCloud', () => {
  it('transfers blob from local to cloud', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();
    const blob = makeBlob({ task: { 'task.2026-01.abc': { id: 'abc' } } });
    await local.write(undefined, 'task.2026-01', blob);

    await copyPartitionToCloud(local, cloud, cloudMeta, entityName, '2026-01');

    const result = await cloud.read(cloudMeta, 'task.2026-01');
    expect(result).not.toBeNull();
    expect(result).toEqual(blob);
  });

  it('is no-op when local blob is null', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    await copyPartitionToCloud(local, cloud, cloudMeta, entityName, '2026-01');

    const result = await cloud.read(cloudMeta, 'task.2026-01');
    expect(result).toBeNull();
  });
});

describe('copyPartitionToLocal', () => {
  it('transfers blob from cloud to local', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();
    const blob = makeBlob({ task: { 'task.2026-01.abc': { id: 'abc' } } });
    await cloud.write(cloudMeta, 'task.2026-01', blob);

    await copyPartitionToLocal(local, cloud, cloudMeta, entityName, '2026-01');

    const result = await local.read(undefined, 'task.2026-01');
    expect(result).not.toBeNull();
    expect(result).toEqual(blob);
  });

  it('is no-op when cloud blob is null', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();

    await copyPartitionToLocal(local, cloud, cloudMeta, entityName, '2026-01');

    const result = await local.read(undefined, 'task.2026-01');
    expect(result).toBeNull();
  });
});

describe('syncCopyPhase', () => {
  it('copies all localOnly to cloud and cloudOnly to local', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();
    const localBlob = makeBlob({ task: { 'task.2026-01.a': { id: 'a' } } });
    const cloudBlob = makeBlob({ task: { 'task.2026-02.b': { id: 'b' } } });
    await local.write(undefined, 'task.2026-01', localBlob);
    await cloud.write(cloudMeta, 'task.2026-02', cloudBlob);

    const diff = {
      localOnly: ['2026-01'],
      cloudOnly: ['2026-02'],
      diverged: [],
      unchanged: [],
    };

    const copied = await syncCopyPhase(
      local, cloud, cloudMeta, entityName, diff,
    );

    expect(copied).toHaveLength(2);
    expect(copied).toContain('2026-01');
    expect(copied).toContain('2026-02');

    expect(await cloud.read(cloudMeta, 'task.2026-01')).toEqual(localBlob);
    expect(await local.read(undefined, 'task.2026-02')).toEqual(cloudBlob);
  });

  it('returns empty array when no partitions to copy', async () => {
    const local = createMemoryBlobAdapter();
    const cloud = createMemoryBlobAdapter();
    const diff = {
      localOnly: [] as string[],
      cloudOnly: [] as string[],
      diverged: [],
      unchanged: [],
    };

    const copied = await syncCopyPhase(
      local, cloud, cloudMeta, entityName, diff,
    );

    expect(copied).toHaveLength(0);
  });
});
