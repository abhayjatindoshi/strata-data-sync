import { describe, it, expect } from 'vitest';
import { fnv1a, computePartitionMetadata } from './partition-metadata.js';

describe('fnv1a', () => {
  it('produces consistent hashes', () => {
    const hash1 = fnv1a('hello');
    const hash2 = fnv1a('hello');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = fnv1a('hello');
    const hash2 = fnv1a('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns an unsigned 32-bit integer', () => {
    const hash = fnv1a('test');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('returns offset basis for empty string', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
  });
});

describe('computePartitionMetadata', () => {
  it('returns hash and timestamp', () => {
    const metadata = computePartitionMetadata('{"data":"test"}', 1700000000000);
    expect(metadata.hash).toBe(fnv1a('{"data":"test"}'));
    expect(metadata.hlcTimestamp).toBe(1700000000000);
  });

  it('produces different hashes for different content', () => {
    const m1 = computePartitionMetadata('{"a":1}', 1000);
    const m2 = computePartitionMetadata('{"a":2}', 1000);
    expect(m1.hash).not.toBe(m2.hash);
  });
});
