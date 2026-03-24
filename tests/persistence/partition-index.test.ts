import { describe, it, expect, vi } from 'vitest';
import { loadAllIndexes, saveAllIndexes, updatePartitionIndexEntry } from '@strata/persistence';
import { createMemoryBlobAdapter } from '@strata/adapter';

describe('Partition Index', () => {
  it('loadAllIndexes returns empty object for missing blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const indexes = await loadAllIndexes(adapter, undefined);
    expect(indexes).toEqual({});
  });

  it('save and load round-trip', async () => {
    const adapter = createMemoryBlobAdapter();
    const indexes = {
      transaction: {
        '2026-01': { hash: 12345, count: 10, updatedAt: 1711100000 },
        '2026-02': { hash: 67890, count: 20, updatedAt: 1711200000 },
      },
    };
    await saveAllIndexes(adapter, undefined, indexes);
    const loaded = await loadAllIndexes(adapter, undefined);
    expect(loaded).toEqual(indexes);
  });

  it('uses __index key', async () => {
    const adapter = createMemoryBlobAdapter();
    const indexes = {
      transaction: { '2026-01': { hash: 1, count: 1, updatedAt: 1 } },
    };
    await saveAllIndexes(adapter, undefined, indexes);
    const keys = await adapter.list(undefined, '__index');
    expect(keys).toContain('__index');
  });

  describe('updatePartitionIndexEntry', () => {
    it('creates new entry', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1711300000);
      const index = {};
      const result = updatePartitionIndexEntry(index, '2026-03', 999, 5);
      expect(result['2026-03']).toEqual({ hash: 999, count: 5, updatedAt: 1711300000 });
      vi.restoreAllMocks();
    });

    it('updates existing entry', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1711400000);
      const index = {
        '2026-01': { hash: 100, count: 10, updatedAt: 1711100000 },
      };
      const result = updatePartitionIndexEntry(index, '2026-01', 200, 20);
      expect(result['2026-01']).toEqual({ hash: 200, count: 20, updatedAt: 1711400000 });
      vi.restoreAllMocks();
    });

    it('preserves other entries when updating', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1711400000);
      const index = {
        '2026-01': { hash: 100, count: 10, updatedAt: 1711100000 },
        '2026-02': { hash: 200, count: 20, updatedAt: 1711200000 },
      };
      const result = updatePartitionIndexEntry(index, '2026-01', 300, 30);
      expect(result['2026-02']).toEqual(index['2026-02']);
      vi.restoreAllMocks();
    });
  });
});
