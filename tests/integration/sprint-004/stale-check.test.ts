import { describe, it, expect } from 'vitest';
import { isStale } from '../../../src/sync/index.js';
import type { PartitionMeta } from '../../../src/sync/index.js';

describe('Integration: stale-check', () => {
  it('returns false when metadata is unchanged', () => {
    const meta: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    expect(isStale(meta, meta, ['task:p1'])).toBe(false);
  });

  it('detects hash change as stale', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 999, updatedAt: 1000 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('detects timestamp change as stale', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 2000 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('detects partition added after snapshot as stale', () => {
    const before: Record<string, PartitionMeta> = {};
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('detects partition removed after snapshot as stale', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
    };
    const after: Record<string, PartitionMeta> = {};
    expect(isStale(before, after, ['task:p1'])).toBe(true);
  });

  it('only checks the specified entity keys', () => {
    const before: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
      'task:p2': { hash: 200, updatedAt: 2000 },
    };
    const after: Record<string, PartitionMeta> = {
      'task:p1': { hash: 100, updatedAt: 1000 },
      'task:p2': { hash: 999, updatedAt: 9999 },
    };
    expect(isStale(before, after, ['task:p1'])).toBe(false);
    expect(isStale(before, after, ['task:p2'])).toBe(true);
  });
});
