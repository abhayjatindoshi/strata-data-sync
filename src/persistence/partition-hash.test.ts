import { describe, it, expect } from 'vitest';
import type { BaseEntity } from '../entity/index.js';
import { computePartitionHash } from './partition-hash.js';

function makeEntity(
  id: string,
  timestamp: number,
  counter: number,
  nodeId: string,
): BaseEntity {
  return {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    device: 'test',
    hlc: { timestamp, counter, nodeId },
  };
}

describe('computePartitionHash', () => {
  it('should return consistent hash for same entities', () => {
    const entities = [makeEntity('a', 100, 0, 'node1')];
    expect(computePartitionHash(entities)).toBe(
      computePartitionHash(entities),
    );
  });

  it('should be order-independent (sorted by ID)', () => {
    const e1 = makeEntity('a', 100, 0, 'node1');
    const e2 = makeEntity('b', 200, 0, 'node1');
    expect(computePartitionHash([e1, e2])).toBe(
      computePartitionHash([e2, e1]),
    );
  });

  it('should differ when entity data differs', () => {
    const entities1 = [makeEntity('a', 100, 0, 'node1')];
    const entities2 = [makeEntity('a', 200, 0, 'node1')];
    expect(computePartitionHash(entities1)).not.toBe(
      computePartitionHash(entities2),
    );
  });

  it('should handle empty array', () => {
    expect(computePartitionHash([])).toBe(computePartitionHash([]));
  });

  it('should differ when counter differs', () => {
    const entities1 = [makeEntity('a', 100, 0, 'node1')];
    const entities2 = [makeEntity('a', 100, 1, 'node1')];
    expect(computePartitionHash(entities1)).not.toBe(
      computePartitionHash(entities2),
    );
  });
});
