import { describe, it, expect } from 'vitest';
import { metadataDiff } from '../../../src/sync/index.js';
import type { PartitionMeta } from '../../../src/sync/index.js';

describe('Integration: metadata-diff', () => {
  it('returns empty buckets when both sides match', () => {
    const meta: Record<string, PartitionMeta> = {
      'task:2026-03': { hash: 111, updatedAt: 100 },
      'task:2026-04': { hash: 222, updatedAt: 200 },
    };
    const result = metadataDiff(meta, { ...meta });
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });

  it('categorizes partitions into 3 buckets correctly', () => {
    const a: Record<string, PartitionMeta> = {
      'task:2026-01': { hash: 10, updatedAt: 100 },
      'task:2026-02': { hash: 20, updatedAt: 200 },
      'task:2026-03': { hash: 30, updatedAt: 300 },
    };
    const b: Record<string, PartitionMeta> = {
      'task:2026-02': { hash: 99, updatedAt: 250 },
      'task:2026-03': { hash: 30, updatedAt: 300 },
      'task:2026-04': { hash: 40, updatedAt: 400 },
    };
    const result = metadataDiff(a, b);
    expect(result.aOnly).toEqual(['task:2026-01']);
    expect(result.bOnly).toEqual(['task:2026-04']);
    expect(result.mismatched).toEqual(['task:2026-02']);
  });

  it('treats partitions with same hash but different timestamps as matching', () => {
    const a: Record<string, PartitionMeta> = {
      'note:p1': { hash: 42, updatedAt: 100 },
    };
    const b: Record<string, PartitionMeta> = {
      'note:p1': { hash: 42, updatedAt: 999 },
    };
    const result = metadataDiff(a, b);
    expect(result.mismatched).toEqual([]);
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
  });

  it('handles one side being empty', () => {
    const a: Record<string, PartitionMeta> = {
      'task:p1': { hash: 1, updatedAt: 10 },
      'task:p2': { hash: 2, updatedAt: 20 },
    };
    const result = metadataDiff(a, {});
    expect(result.aOnly).toEqual(['task:p1', 'task:p2']);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });

  it('handles both sides empty', () => {
    const result = metadataDiff({}, {});
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });
});
