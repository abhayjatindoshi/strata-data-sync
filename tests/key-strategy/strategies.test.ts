import { describe, it, expect } from 'vitest';
import { singleton, global, partitioned } from '@strata/key-strategy/strategies.js';

describe('singleton', () => {
  it('has type singleton', () => {
    expect(singleton.type).toBe('singleton');
  });

  it('always returns _ as partition key', () => {
    expect(singleton.getPartitionKey({})).toBe('_');
    expect(singleton.getPartitionKey({ any: 'value' })).toBe('_');
  });
});

describe('global', () => {
  it('has type global', () => {
    expect(global.type).toBe('global');
  });

  it('always returns _ as partition key', () => {
    expect(global.getPartitionKey({})).toBe('_');
  });
});

describe('partitioned', () => {
  it('has type partitioned', () => {
    const strategy = partitioned<{ userId: string }>(e => e.userId);
    expect(strategy.type).toBe('partitioned');
  });

  it('extracts partition key from entity', () => {
    const strategy = partitioned<{ userId: string }>(e => e.userId);
    expect(strategy.getPartitionKey({ userId: 'user-42' })).toBe('user-42');
  });

  it('supports different partition functions', () => {
    const strategy = partitioned<{ region: string }>(e => e.region);
    expect(strategy.getPartitionKey({ region: 'us-east' })).toBe('us-east');
  });
});
