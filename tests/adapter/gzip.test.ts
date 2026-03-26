import { describe, it, expect } from 'vitest';
import { gzipTransform } from '@strata/adapter';

describe('gzipTransform', () => {
  const transform = gzipTransform();

  it('round-trips data through encode/decode', async () => {
    const input = new TextEncoder().encode('Hello, Strata!');
    const compressed = await transform.encode(input);
    const decompressed = await transform.decode(compressed);
    expect(decompressed).toEqual(input);
  });

  it('compressed output differs from input', async () => {
    const input = new TextEncoder().encode('Hello, Strata!');
    const compressed = await transform.encode(input);
    expect(compressed).not.toEqual(input);
  });

  it('compresses repetitive data smaller than input', async () => {
    const input = new TextEncoder().encode('A'.repeat(1000));
    const compressed = await transform.encode(input);
    expect(compressed.length).toBeLessThan(input.length);
  });

  it('round-trips empty data', async () => {
    const input = new Uint8Array(0);
    const compressed = await transform.encode(input);
    const decompressed = await transform.decode(compressed);
    expect(decompressed).toEqual(input);
  });

  it('round-trips large data', async () => {
    const input = new Uint8Array(10_000);
    for (let i = 0; i < input.length; i++) {
      input[i] = i % 256;
    }
    const compressed = await transform.encode(input);
    const decompressed = await transform.decode(compressed);
    expect(decompressed).toEqual(input);
  });

  it('produces valid gzip (starts with gzip magic bytes)', async () => {
    const input = new TextEncoder().encode('test');
    const compressed = await transform.encode(input);
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
  });
});
