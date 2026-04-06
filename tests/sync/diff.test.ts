import { describe, it, expect } from 'vitest';
import type { PartitionIndex } from '@strata/persistence';
import { saveAllIndexes } from '@strata/persistence';
import { createDataAdapter } from '../helpers';
import { diffPartitions } from '@strata/sync';
import { loadAllIndexPairs } from '@strata/sync/diff';
import { DEFAULT_OPTIONS } from '../helpers';

describe('diffPartitions', () => {
  it('returns all unchanged when hashes match', () => {
    const local: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
      '2026-02': { hash: 222, count: 20, deletedCount: 0, updatedAt: 2000 },
    };
    const cloud: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
      '2026-02': { hash: 222, count: 20, deletedCount: 0, updatedAt: 2000 },
    };

    const result = diffPartitions(local, cloud);

    expect(result.unchanged).toContain('2026-01');
    expect(result.unchanged).toContain('2026-02');
    expect(result.localOnly).toHaveLength(0);
    expect(result.cloudOnly).toHaveLength(0);
    expect(result.diverged).toHaveLength(0);
  });

  it('identifies all local-only partitions', () => {
    const local: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
      '2026-02': { hash: 222, count: 20, deletedCount: 0, updatedAt: 2000 },
    };
    const cloud: PartitionIndex = {};

    const result = diffPartitions(local, cloud);

    expect(result.localOnly).toContain('2026-01');
    expect(result.localOnly).toContain('2026-02');
    expect(result.cloudOnly).toHaveLength(0);
    expect(result.diverged).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('identifies all cloud-only partitions', () => {
    const local: PartitionIndex = {};
    const cloud: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
    };

    const result = diffPartitions(local, cloud);

    expect(result.cloudOnly).toContain('2026-01');
    expect(result.localOnly).toHaveLength(0);
    expect(result.diverged).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('categorizes mixed partitions correctly', () => {
    const local: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
      '2026-02': { hash: 222, count: 20, deletedCount: 0, updatedAt: 2000 },
      '2026-03': { hash: 333, count: 30, deletedCount: 0, updatedAt: 3000 },
    };
    const cloud: PartitionIndex = {
      '2026-02': { hash: 222, count: 20, deletedCount: 0, updatedAt: 2000 },
      '2026-03': { hash: 999, count: 30, deletedCount: 0, updatedAt: 4000 },
      '2026-04': { hash: 444, count: 40, deletedCount: 0, updatedAt: 5000 },
    };

    const result = diffPartitions(local, cloud);

    expect(result.localOnly).toContain('2026-01');
    expect(result.unchanged).toContain('2026-02');
    expect(result.diverged).toContain('2026-03');
    expect(result.cloudOnly).toContain('2026-04');
  });

  it('returns all empty arrays for empty indexes', () => {
    const result = diffPartitions({}, {});

    expect(result.localOnly).toHaveLength(0);
    expect(result.cloudOnly).toHaveLength(0);
    expect(result.diverged).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('identifies single diverged partition with hash mismatch', () => {
    const local: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
    };
    const cloud: PartitionIndex = {
      '2026-01': { hash: 999, count: 10, deletedCount: 0, updatedAt: 2000 },
    };

    const result = diffPartitions(local, cloud);

    expect(result.diverged).toEqual(['2026-01']);
    expect(result.localOnly).toHaveLength(0);
    expect(result.cloudOnly).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('marks diverged when hash matches but count differs', () => {
    const local: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
    };
    const cloud: PartitionIndex = {
      '2026-01': { hash: 111, count: 15, deletedCount: 0, updatedAt: 2000 },
    };

    const result = diffPartitions(local, cloud);
    expect(result.diverged).toEqual(['2026-01']);
    expect(result.unchanged).toHaveLength(0);
  });

  it('marks diverged when hash matches but deletedCount differs', () => {
    const local: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 0, updatedAt: 1000 },
    };
    const cloud: PartitionIndex = {
      '2026-01': { hash: 111, count: 10, deletedCount: 3, updatedAt: 2000 },
    };

    const result = diffPartitions(local, cloud);
    expect(result.diverged).toEqual(['2026-01']);
    expect(result.unchanged).toHaveLength(0);
  });
});

describe('loadAllIndexPairs', () => {
  it('loads indexes from both adapters in parallel', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();

    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(cloud, undefined, {
      task: { '_': { hash: 222, count: 2, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const { localIndexes, cloudIndexes } = await loadAllIndexPairs(local, cloud, undefined, DEFAULT_OPTIONS);

    expect(localIndexes['task']?.['_']?.hash).toBe(111);
    expect(cloudIndexes['task']?.['_']?.hash).toBe(222);
  });

  it('returns empty indexes when adapters have no data', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();

    const { localIndexes, cloudIndexes } = await loadAllIndexPairs(local, cloud, undefined, DEFAULT_OPTIONS);

    expect(Object.keys(localIndexes)).toHaveLength(0);
    expect(Object.keys(cloudIndexes)).toHaveLength(0);
  });
});

