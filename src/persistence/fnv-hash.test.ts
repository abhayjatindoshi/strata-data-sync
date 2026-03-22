import { describe, it, expect } from 'vitest';
import { fnvHash } from './fnv-hash.js';

describe('fnvHash', () => {
  it('should return a number', () => {
    expect(typeof fnvHash('hello')).toBe('number');
  });

  it('should return consistent hash for same input', () => {
    expect(fnvHash('test')).toBe(fnvHash('test'));
  });

  it('should return different hashes for different inputs', () => {
    expect(fnvHash('hello')).not.toBe(fnvHash('world'));
  });

  it('should return offset basis for empty string', () => {
    expect(fnvHash('')).toBe(0x811c9dc5);
  });

  it('should return unsigned 32-bit integer', () => {
    const hash = fnvHash('some long string with stuff');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it('should produce known FNV-1a value for "foobar"', () => {
    const hash = fnvHash('foobar');
    expect(hash).toBe(0xbf9cf968);
  });
});
