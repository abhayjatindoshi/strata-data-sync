import { describe, it, expect } from 'vitest';
import type { PartitionBlob, Tombstone } from '../persistence/index.js';
import { mergePartitionBlobs } from './merge.js';

function makeEntity(id: string, ts: number, counter = 0, nodeId = 'n1') {
  return {
    id,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 1,
    device: 'test',
    hlc: { timestamp: ts, counter, nodeId },
  };
}

function makeTombstone(id: string, ts: number, counter = 0, nodeId = 'n1'): Tombstone {
  return {
    id,
    hlc: { timestamp: ts, counter, nodeId },
    deletedAt: '2024-01-01T00:00:00Z',
  };
}

const empty: PartitionBlob = { entities: {}, deleted: {} };

describe('mergePartitionBlobs', () => {
  it('returns empty for two empty blobs', () => {
    const result = mergePartitionBlobs(empty, empty);
    expect(Object.keys(result.entities)).toHaveLength(0);
    expect(Object.keys(result.deleted)).toHaveLength(0);
  });

  it('includes entity only on local side', () => {
    const local: PartitionBlob = {
      entities: { e1: makeEntity('e1', 1000) },
      deleted: {},
    };
    const result = mergePartitionBlobs(local, empty);
    expect(result.entities['e1']).toBeDefined();
  });

  it('includes entity only on cloud side', () => {
    const cloud: PartitionBlob = {
      entities: { e1: makeEntity('e1', 1000) },
      deleted: {},
    };
    const result = mergePartitionBlobs(empty, cloud);
    expect(result.entities['e1']).toBeDefined();
  });

  it('picks local entity when local HLC is newer', () => {
    const localEntity = makeEntity('e1', 2000);
    const cloudEntity = makeEntity('e1', 1000);
    const local: PartitionBlob = { entities: { e1: localEntity }, deleted: {} };
    const cloud: PartitionBlob = { entities: { e1: cloudEntity }, deleted: {} };

    const result = mergePartitionBlobs(local, cloud);
    expect(result.entities['e1']).toBe(localEntity);
  });

  it('picks cloud entity when cloud HLC is newer', () => {
    const localEntity = makeEntity('e1', 1000);
    const cloudEntity = makeEntity('e1', 2000);
    const local: PartitionBlob = { entities: { e1: localEntity }, deleted: {} };
    const cloud: PartitionBlob = { entities: { e1: cloudEntity }, deleted: {} };

    const result = mergePartitionBlobs(local, cloud);
    expect(result.entities['e1']).toBe(cloudEntity);
  });

  it('uses counter as tiebreaker', () => {
    const localEntity = makeEntity('e1', 1000, 2);
    const cloudEntity = makeEntity('e1', 1000, 1);
    const local: PartitionBlob = { entities: { e1: localEntity }, deleted: {} };
    const cloud: PartitionBlob = { entities: { e1: cloudEntity }, deleted: {} };

    const result = mergePartitionBlobs(local, cloud);
    expect(result.entities['e1']).toBe(localEntity);
  });

  it('tombstone wins over live entity when tombstone is newer', () => {
    const liveEntity = makeEntity('e1', 1000);
    const tombstone = makeTombstone('e1', 2000);
    const local: PartitionBlob = { entities: { e1: liveEntity }, deleted: {} };
    const cloud: PartitionBlob = { entities: {}, deleted: { e1: tombstone } };

    const result = mergePartitionBlobs(local, cloud);
    expect(result.entities['e1']).toBeUndefined();
    expect(result.deleted['e1']).toBe(tombstone);
  });

  it('live entity wins over tombstone when live is newer', () => {
    const liveEntity = makeEntity('e1', 2000);
    const tombstone = makeTombstone('e1', 1000);
    const local: PartitionBlob = { entities: {}, deleted: { e1: tombstone } };
    const cloud: PartitionBlob = { entities: { e1: liveEntity }, deleted: {} };

    const result = mergePartitionBlobs(local, cloud);
    expect(result.entities['e1']).toBe(liveEntity);
    expect(result.deleted['e1']).toBeUndefined();
  });

  it('merges tombstones keeping newer', () => {
    const localTombstone = makeTombstone('e1', 1000);
    const cloudTombstone = makeTombstone('e1', 2000);
    const local: PartitionBlob = { entities: {}, deleted: { e1: localTombstone } };
    const cloud: PartitionBlob = { entities: {}, deleted: { e1: cloudTombstone } };

    const result = mergePartitionBlobs(local, cloud);
    expect(result.deleted['e1']).toBe(cloudTombstone);
  });

  it('merges multiple entities across both sides', () => {
    const local: PartitionBlob = {
      entities: { e1: makeEntity('e1', 2000), e2: makeEntity('e2', 1000) },
      deleted: {},
    };
    const cloud: PartitionBlob = {
      entities: { e2: makeEntity('e2', 2000), e3: makeEntity('e3', 1000) },
      deleted: {},
    };

    const result = mergePartitionBlobs(local, cloud);
    expect(Object.keys(result.entities).sort()).toEqual(['e1', 'e2', 'e3']);
  });
});
