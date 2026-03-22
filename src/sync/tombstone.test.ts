import { describe, it, expect } from 'vitest';
import type { PartitionBlob, Tombstone } from '../persistence/index.js';
import { purgeExpiredTombstones, createTombstone } from './tombstone.js';

function makeTombstone(id: string, deletedAt: string): Tombstone {
  return {
    id,
    hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
    deletedAt,
  };
}

const MS_PER_DAY = 86_400_000;

describe('purgeExpiredTombstones', () => {
  it('keeps tombstones within retention window', () => {
    const now = Date.now();
    const recent = new Date(now - 10 * MS_PER_DAY).toISOString();
    const blob: PartitionBlob = {
      entities: {},
      deleted: { e1: makeTombstone('e1', recent) },
    };
    const result = purgeExpiredTombstones(blob, 90, now);
    expect(result.deleted['e1']).toBeDefined();
  });

  it('removes tombstones beyond retention window', () => {
    const now = Date.now();
    const old = new Date(now - 100 * MS_PER_DAY).toISOString();
    const blob: PartitionBlob = {
      entities: {},
      deleted: { e1: makeTombstone('e1', old) },
    };
    const result = purgeExpiredTombstones(blob, 90, now);
    expect(result.deleted['e1']).toBeUndefined();
  });

  it('returns same blob reference when nothing purged', () => {
    const now = Date.now();
    const recent = new Date(now - 10 * MS_PER_DAY).toISOString();
    const blob: PartitionBlob = {
      entities: {},
      deleted: { e1: makeTombstone('e1', recent) },
    };
    const result = purgeExpiredTombstones(blob, 90, now);
    expect(result).toBe(blob);
  });

  it('handles empty deleted map', () => {
    const blob: PartitionBlob = { entities: {}, deleted: {} };
    const result = purgeExpiredTombstones(blob);
    expect(result).toBe(blob);
  });

  it('preserves entities when purging tombstones', () => {
    const now = Date.now();
    const old = new Date(now - 100 * MS_PER_DAY).toISOString();
    const entity = { id: 'e2', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const blob: PartitionBlob = {
      entities: { e2: entity },
      deleted: { e1: makeTombstone('e1', old) },
    };
    const result = purgeExpiredTombstones(blob, 90, now);
    expect(result.entities['e2']).toBe(entity);
    expect(result.deleted['e1']).toBeUndefined();
  });

  it('uses configurable retention days', () => {
    const now = Date.now();
    const age50 = new Date(now - 50 * MS_PER_DAY).toISOString();
    const blob: PartitionBlob = {
      entities: {},
      deleted: { e1: makeTombstone('e1', age50) },
    };
    expect(purgeExpiredTombstones(blob, 30, now).deleted['e1']).toBeUndefined();
    expect(purgeExpiredTombstones(blob, 90, now).deleted['e1']).toBeDefined();
  });
});

describe('createTombstone', () => {
  it('creates tombstone with given values', () => {
    const hlc = { timestamp: 5000, counter: 2, nodeId: 'n2' };
    const date = new Date('2025-01-15T12:00:00Z');
    const ts = createTombstone('e1', hlc, date);
    expect(ts.id).toBe('e1');
    expect(ts.hlc).toBe(hlc);
    expect(ts.deletedAt).toBe('2025-01-15T12:00:00.000Z');
  });

  it('defaults deletedAt to now', () => {
    const hlc = { timestamp: 5000, counter: 0, nodeId: 'n1' };
    const before = Date.now();
    const ts = createTombstone('e1', hlc);
    const after = Date.now();
    const tsTime = new Date(ts.deletedAt).getTime();
    expect(tsTime).toBeGreaterThanOrEqual(before);
    expect(tsTime).toBeLessThanOrEqual(after);
  });
});
