import { describe, it, expect } from 'vitest';
import { mergePartitionEntities, recomputeMetadata } from './sync-apply';
import type { EntityMetadataMap, SyncEntity } from './sync-types';

describe('mergePartitionEntities', () => {
  it('includes a-only entities', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', name: 'foo' }];
    const aMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const result = mergePartitionEntities(aEntities, [], aMeta, {});
    expect(result.merged).toEqual([{ id: 'e1', name: 'foo' }]);
    expect(result.deletedIds).toEqual([]);
    expect(result.conflictsResolved).toBe(0);
  });

  it('includes b-only entities', () => {
    const bEntities: SyncEntity[] = [{ id: 'e1', name: 'bar' }];
    const bMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const result = mergePartitionEntities([], bEntities, {}, bMeta);
    expect(result.merged).toEqual([{ id: 'e1', name: 'bar' }]);
  });

  it('keeps winning entity on conflict — A wins', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', name: 'A-version' }];
    const bEntities: SyncEntity[] = [{ id: 'e1', name: 'B-version' }];
    const aMeta: EntityMetadataMap = { 'e1': { updatedAt: 2000, version: 0, device: 'a' } };
    const bMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toEqual([{ id: 'e1', name: 'A-version' }]);
    expect(result.conflictsResolved).toBe(1);
  });

  it('keeps winning entity on conflict — B wins', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', name: 'A-version' }];
    const bEntities: SyncEntity[] = [{ id: 'e1', name: 'B-version' }];
    const aMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const bMeta: EntityMetadataMap = { 'e1': { updatedAt: 2000, version: 0, device: 'a' } };
    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toEqual([{ id: 'e1', name: 'B-version' }]);
    expect(result.conflictsResolved).toBe(1);
  });

  it('deletes entity when delete wins on equal HLC', () => {
    const aEntities: SyncEntity[] = [];
    const bEntities: SyncEntity[] = [{ id: 'e1', name: 'B-version' }];
    const aMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a', deleted: true } };
    const bMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toEqual([]);
    expect(result.deletedIds).toEqual(['e1']);
    expect(result.conflictsResolved).toBe(1);
  });

  it('keeps both sides entities when no overlap', () => {
    const aEntities: SyncEntity[] = [{ id: 'e1', name: 'A' }];
    const bEntities: SyncEntity[] = [{ id: 'e2', name: 'B' }];
    const aMeta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const bMeta: EntityMetadataMap = { 'e2': { updatedAt: 1000, version: 0, device: 'b' } };
    const result = mergePartitionEntities(aEntities, bEntities, aMeta, bMeta);
    expect(result.merged).toHaveLength(2);
    expect(result.conflictsResolved).toBe(0);
  });

  it('equal entities are kept without counting as conflict', () => {
    const entities: SyncEntity[] = [{ id: 'e1', name: 'same' }];
    const meta: EntityMetadataMap = { 'e1': { updatedAt: 1000, version: 0, device: 'a' } };
    const result = mergePartitionEntities(entities, entities, meta, meta);
    expect(result.merged).toEqual([{ id: 'e1', name: 'same' }]);
    expect(result.conflictsResolved).toBe(0);
  });
});

describe('recomputeMetadata', () => {
  it('computes hash and returns updatedAt', () => {
    const result = recomputeMetadata('{"id":"e1"}', 5000);
    expect(result.hash).toBeTypeOf('number');
    expect(result.updatedAt).toBe(5000);
  });

  it('produces different hashes for different content', () => {
    const r1 = recomputeMetadata('{"a":1}', 1000);
    const r2 = recomputeMetadata('{"b":2}', 1000);
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('produces same hash for same content', () => {
    const r1 = recomputeMetadata('{"a":1}', 1000);
    const r2 = recomputeMetadata('{"a":1}', 2000);
    expect(r1.hash).toBe(r2.hash);
  });
});
