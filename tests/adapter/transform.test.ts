import { describe, it, expect } from 'vitest';
import {
  gzip,
  encrypt,
  applyEncodeTransforms,
  applyDecodeTransforms,
} from '@strata/adapter/transform.js';

describe('gzip', () => {
  it('should compress and decompress', async () => {
    const transform = gzip();
    const input = new TextEncoder().encode('hello world');
    const compressed = await transform.encode(input);
    expect(compressed.length).toBeGreaterThan(0);
    const decompressed = await transform.decode(compressed);
    expect(new TextDecoder().decode(decompressed)).toBe('hello world');
  });

  it('should compress large data to smaller size', async () => {
    const transform = gzip();
    const input = new TextEncoder().encode('a'.repeat(10000));
    const compressed = await transform.encode(input);
    expect(compressed.length).toBeLessThan(input.length);
  });
});

describe('encrypt', () => {
  async function generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  it('should encrypt and decrypt', async () => {
    const key = await generateKey();
    const transform = encrypt(key);
    const input = new TextEncoder().encode('secret data');
    const encrypted = await transform.encode(input);
    expect(encrypted.length).toBeGreaterThan(input.length);
    const decrypted = await transform.decode(encrypted);
    expect(new TextDecoder().decode(decrypted)).toBe('secret data');
  });

  it('should produce different ciphertext each time', async () => {
    const key = await generateKey();
    const transform = encrypt(key);
    const input = new TextEncoder().encode('same input');
    const e1 = await transform.encode(input);
    const e2 = await transform.encode(input);
    const s1 = Array.from(e1).join(',');
    const s2 = Array.from(e2).join(',');
    expect(s1).not.toBe(s2);
  });
});

describe('applyTransforms', () => {
  it('should chain encode and decode', async () => {
    const transform = gzip();
    const input = new TextEncoder().encode('pipeline test');
    const encoded = await applyEncodeTransforms([transform], input);
    const decoded = await applyDecodeTransforms([transform], encoded);
    expect(new TextDecoder().decode(decoded)).toBe('pipeline test');
  });

  it('should apply in order for encode, reverse for decode', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const transforms = [gzip(), encrypt(key)];
    const input = new TextEncoder().encode('multi-transform');
    const encoded = await applyEncodeTransforms(transforms, input);
    const decoded = await applyDecodeTransforms(transforms, encoded);
    expect(new TextDecoder().decode(decoded)).toBe('multi-transform');
  });

  it('should handle empty transforms array', async () => {
    const input = new TextEncoder().encode('passthrough');
    const encoded = await applyEncodeTransforms([], input);
    expect(encoded).toBe(input);
  });
});
