import { describe, it, expect } from 'vitest';
import { mergePartitionEntities, recomputeMetadata } from '../../../src/sync/index.js';
import { serialize } from '../../../src/persistence/index.js';
import type { EntityMetadataMap, SyncEntity } from '../../../src/sync/index.js';

describe('Integration: sync-apply', () => {
  it('merges entities from both sides, keeping the winning version', () => {
    const aEntities: SyncEntity[] = [
      { id: 'e1', name: 'A-version' },
      { id: 'e2', name: 'shared' },
    ];
    const bEntities: SyncEntity[] = [
      { id: 'e1', name: 'B-version' },
      { id: 'e3', name: 'B-only' },
    ];
    const aMeta: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'A' },
      e2: { updatedAt: 100, version: 1, device: 'A' },
    };
    const bMeta: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'B' },
      e3: { updatedAt: 300, version: 1, device: 'B' },
    };

    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(3);
    const e1 = result.merged.find(e => e.id === 'e1');
    expect(e1?.name).toBe('A-version');
    expect(result.merged.find(e => e.id === 'e3')?.name).toBe('B-only');
    expect(result.conflictsResolved).toBeGreaterThan(0);
  });

  it('removes deleted entities from merged output', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', name: 'alive' }];
    const bEntities: SyncEntity[] = [];
    const aMeta: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const bMeta: EntityMetadataMap = {
      e1: { updatedAt: 200, version: 1, device: 'B', deleted: true },
    };

    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(0);
    expect(result.deletedIds).toContain('e1');
  });

  it('includes a-only and b-only entities in the merge', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', val: 1 }];
    const bEntities: SyncEntity[] = [{ id: 'e2', val: 2 }];
    const aMeta: EntityMetadataMap = {
      e1: { updatedAt: 100, version: 1, device: 'A' },
    };
    const bMeta: EntityMetadataMap = {
      e2: { updatedAt: 100, version: 1, device: 'B' },
    };

    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(2);
    expect(result.conflictsResolved).toBe(0);
  });

  describe('recomputeMetadata', () => {
    it('produces consistent hash for the same content', () => {
      const content = serialize([{ id: 'e1', name: 'test' }]);
      const m1 = recomputeMetadata(content, 500);
      const m2 = recomputeMetadata(content, 500);
      expect(m1.hash).toBe(m2.hash);
      expect(m1.updatedAt).toBe(500);
    });

    it('produces different hash for different content', () => {
      const c1 = serialize([{ id: 'e1' }]);
      const c2 = serialize([{ id: 'e2' }]);
      const m1 = recomputeMetadata(c1, 100);
      const m2 = recomputeMetadata(c2, 100);
      expect(m1.hash).not.toBe(m2.hash);
    });
  });
});
