import { describe, it, expect } from 'vitest';
import { deepDiff } from '../../../src/sync/index.js';
import type { EntityMetadataMap } from '../../../src/sync/index.js';

describe('Integration: deep-diff', () => {
  it('detects one-way-copy when only A has newer entities', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'A' },
      e2: { updatedAt: 300, version: 1, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
      e2: { updatedAt: 100, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('a-to-b');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every(e => e.direction === 'a-to-b')).toBe(true);
  });

  it('detects one-way-copy when only B has newer entities', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'A' },
      e2: { updatedAt: 300, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('b-to-a');
    expect(result.entries).toHaveLength(2);
  });

  it('returns no oneWayCopy when changes go both directions', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 300, version: 1, device: 'A' },
      e2: { updatedAt: 100, version: 1, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
      e2: { updatedAt: 300, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBeUndefined();
    expect(result.entries).toHaveLength(2);
  });

  it('returns empty entries when metadata is identical', () => {
    const same: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const result = deepDiff(same, { ...same });
    expect(result.entries).toHaveLength(0);
    expect(result.oneWayCopy).toBeUndefined();
  });

  it('handles new entities only on one side as one-way-copy', () => {
    const a: EntityMetadataMap = {};
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'B' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('b-to-a');
    expect(result.entries).toEqual([{ id: 'e1', direction: 'b-to-a' }]);
  });

  it('uses HLC comparison for per-entity direction', () => {
    const a: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 2, device: 'A' },
    };
    const b: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const result = deepDiff(a, b);
    expect(result.entries).toEqual([{ id: 'e1', direction: 'a-to-b' }]);
  });
});
