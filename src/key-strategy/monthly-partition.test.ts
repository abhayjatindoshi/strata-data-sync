import { describe, it, expect } from 'vitest';
import { monthlyPartition } from './monthly-partition.js';

describe('monthlyPartition', () => {
  it('extracts YYYY-MM from a date field', () => {
    const strategy = monthlyPartition<{ createdAt: Date }>('createdAt');
    const entity = { createdAt: new Date('2024-03-15T10:00:00Z') };
    expect(strategy.getPartitionKey(entity)).toBe('2024-03');
  });

  it('pads single-digit months', () => {
    const strategy = monthlyPartition<{ createdAt: Date }>('createdAt');
    const entity = { createdAt: new Date('2024-01-05T10:00:00Z') };
    expect(strategy.getPartitionKey(entity)).toBe('2024-01');
  });

  it('has type partitioned', () => {
    const strategy = monthlyPartition<{ createdAt: Date }>('createdAt');
    expect(strategy.type).toBe('partitioned');
  });

  it('throws if field is not a Date', () => {
    const strategy = monthlyPartition<{ name: unknown }>('name');
    expect(() => strategy.getPartitionKey({ name: 'not-a-date' })).toThrow('is not a Date');
  });
});
