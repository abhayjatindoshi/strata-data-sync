import { describe, it, expect } from 'vitest';
import { deepDiff } from './deep-diff.js';
import type { EntityMetadataMap } from './sync-types.js';

describe('deepDiff', () => {
  it('returns empty for identical metadata', () => {
    const meta: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
    };
    const result = deepDiff(meta, meta);
    expect(result.entries).toEqual([]);
    expect(result.oneWayCopy).toBeUndefined();
  });

  it('identifies a-only entities', () => {
    const a: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
    };
    const result = deepDiff(a, {});
    expect(result.entries).toEqual([{ id: 'e1', direction: 'a-to-b' }]);
    expect(result.oneWayCopy).toBe('a-to-b');
  });

  it('identifies b-only entities', () => {
    const b: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
    };
    const result = deepDiff({}, b);
    expect(result.entries).toEqual([{ id: 'e1', direction: 'b-to-a' }]);
    expect(result.oneWayCopy).toBe('b-to-a');
  });

  it('identifies direction by HLC comparison', () => {
    const a: EntityMetadataMap = {
      'e1': { updatedAt: 2000, version: 0, device: 'a' },
    };
    const b: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
    };
    const result = deepDiff(a, b);
    expect(result.entries).toEqual([{ id: 'e1', direction: 'a-to-b' }]);
  });

  it('detects one-way-copy when all entities are newer on A', () => {
    const a: EntityMetadataMap = {
      'e1': { updatedAt: 2000, version: 0, device: 'a' },
      'e2': { updatedAt: 3000, version: 0, device: 'a' },
    };
    const b: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
      'e2': { updatedAt: 1500, version: 0, device: 'a' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBe('a-to-b');
  });

  it('no one-way-copy when both sides have newer entities', () => {
    const a: EntityMetadataMap = {
      'e1': { updatedAt: 2000, version: 0, device: 'a' },
      'e2': { updatedAt: 1000, version: 0, device: 'a' },
    };
    const b: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
      'e2': { updatedAt: 2000, version: 0, device: 'a' },
    };
    const result = deepDiff(a, b);
    expect(result.oneWayCopy).toBeUndefined();
    expect(result.entries).toHaveLength(2);
  });

  it('handles delete wins on equal HLC', () => {
    const a: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a', deleted: true },
    };
    const b: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
    };
    const result = deepDiff(a, b);
    expect(result.entries).toEqual([{ id: 'e1', direction: 'a-to-b' }]);
  });

  it('returns empty entries when all entities match', () => {
    const a: EntityMetadataMap = {
      'e1': { updatedAt: 1000, version: 0, device: 'a' },
      'e2': { updatedAt: 2000, version: 1, device: 'b' },
    };
    const result = deepDiff(a, { ...a });
    expect(result.entries).toEqual([]);
    expect(result.oneWayCopy).toBeUndefined();
  });
});
