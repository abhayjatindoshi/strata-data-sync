import { describe, it, expect } from 'vitest';
import type { Hlc } from '@strata/hlc';
import { purgeStaleTombstones, DEFAULT_TOMBSTONE_RETENTION_MS } from '@strata/sync';

describe('purgeStaleTombstones', () => {
  const now = 1_000_000_000;

  it('removes tombstones older than retention period', () => {
    const tombstones = new Map<string, Hlc>([
      ['e1', { timestamp: now - DEFAULT_TOMBSTONE_RETENTION_MS - 1, counter: 0, nodeId: 'n1' }],
      ['e2', { timestamp: now - DEFAULT_TOMBSTONE_RETENTION_MS + 1000, counter: 0, nodeId: 'n1' }],
    ]);

    const purged = purgeStaleTombstones(tombstones, DEFAULT_TOMBSTONE_RETENTION_MS, now);

    expect(purged).toBe(1);
    expect(tombstones.size).toBe(1);
    expect(tombstones.has('e2')).toBe(true);
  });

  it('returns 0 when no tombstones are stale', () => {
    const tombstones = new Map<string, Hlc>([
      ['e1', { timestamp: now - 1000, counter: 0, nodeId: 'n1' }],
    ]);

    const purged = purgeStaleTombstones(tombstones, DEFAULT_TOMBSTONE_RETENTION_MS, now);

    expect(purged).toBe(0);
    expect(tombstones.size).toBe(1);
  });

  it('purges all when all are stale', () => {
    const tombstones = new Map<string, Hlc>([
      ['e1', { timestamp: now - DEFAULT_TOMBSTONE_RETENTION_MS - 2000, counter: 0, nodeId: 'n1' }],
      ['e2', { timestamp: now - DEFAULT_TOMBSTONE_RETENTION_MS - 1000, counter: 0, nodeId: 'n1' }],
    ]);

    const purged = purgeStaleTombstones(tombstones, DEFAULT_TOMBSTONE_RETENTION_MS, now);

    expect(purged).toBe(2);
    expect(tombstones.size).toBe(0);
  });

  it('handles empty map', () => {
    const tombstones = new Map<string, Hlc>();
    const purged = purgeStaleTombstones(tombstones, DEFAULT_TOMBSTONE_RETENTION_MS, now);
    expect(purged).toBe(0);
  });

  it('respects custom retention period', () => {
    const customRetention = 1000;
    const tombstones = new Map<string, Hlc>([
      ['e1', { timestamp: now - 1001, counter: 0, nodeId: 'n1' }],
      ['e2', { timestamp: now - 999, counter: 0, nodeId: 'n1' }],
    ]);

    const purged = purgeStaleTombstones(tombstones, customRetention, now);

    expect(purged).toBe(1);
    expect(tombstones.has('e2')).toBe(true);
  });

  it('default retention is 90 days in milliseconds', () => {
    expect(DEFAULT_TOMBSTONE_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
