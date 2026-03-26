import { describe, it, expect } from 'vitest';
import {
  deriveKek, generateDek, wrapDek, unwrapDek,
  encrypt, decrypt, InvalidEncryptionKeyError,
} from '@strata/adapter/crypto';

describe('Encryption primitives', () => {
  const appId = 'test-app';

  describe('deriveKek', () => {
    it('produces a CryptoKey from password+salt+appId', async () => {
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const kek = await deriveKek('password', salt, appId);
      expect(kek).toBeDefined();
      expect(kek.algorithm).toMatchObject({ name: 'AES-GCM' });
    });

    it('same inputs produce same key', async () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const kek1 = await deriveKek('password', salt, appId);
      const kek2 = await deriveKek('password', salt, appId);
      // Export both keys to compare raw bytes
      const dek = await generateDek();
      const wrapped1 = await wrapDek(dek, kek1);
      // Wrapping with kek1 should be unwrappable with kek2
      const unwrapped = await unwrapDek(wrapped1, kek2);
      expect(unwrapped).toBeDefined();
    });

    it('different passwords produce different keys', async () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const kek1 = await deriveKek('password1', salt, appId);
      const kek2 = await deriveKek('password2', salt, appId);
      const dek = await generateDek();
      const wrapped = await wrapDek(dek, kek1);
      await expect(unwrapDek(wrapped, kek2)).rejects.toThrow(InvalidEncryptionKeyError);
    });
  });

  describe('generateDek', () => {
    it('produces extractable AES-256-GCM key', async () => {
      const dek = await generateDek();
      expect(dek.extractable).toBe(true);
      expect(dek.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    });

    it('generates unique keys', async () => {
      const dek1 = await generateDek();
      const dek2 = await generateDek();
      const raw1 = await globalThis.crypto.subtle.exportKey('raw', dek1);
      const raw2 = await globalThis.crypto.subtle.exportKey('raw', dek2);
      expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2));
    });
  });

  describe('wrapDek / unwrapDek', () => {
    it('round-trip', async () => {
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const kek = await deriveKek('password', salt, appId);
      const dek = await generateDek();
      const wrapped = await wrapDek(dek, kek);
      const unwrapped = await unwrapDek(wrapped, kek);

      const original = await globalThis.crypto.subtle.exportKey('raw', dek);
      const recovered = await globalThis.crypto.subtle.exportKey('raw', unwrapped);
      expect(new Uint8Array(recovered)).toEqual(new Uint8Array(original));
    });

    it('wrong KEK throws InvalidEncryptionKeyError', async () => {
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const kek1 = await deriveKek('correct', salt, appId);
      const kek2 = await deriveKek('wrong', salt, appId);
      const dek = await generateDek();
      const wrapped = await wrapDek(dek, kek1);
      await expect(unwrapDek(wrapped, kek2)).rejects.toThrow(InvalidEncryptionKeyError);
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trip', async () => {
      const dek = await generateDek();
      const plaintext = new TextEncoder().encode('Hello, World!');
      const ciphertext = await encrypt(plaintext, dek);
      const result = await decrypt(ciphertext, dek);
      expect(result).toEqual(plaintext);
    });

    it('ciphertext starts with version byte', async () => {
      const dek = await generateDek();
      const plaintext = new Uint8Array([1, 2, 3]);
      const ciphertext = await encrypt(plaintext, dek);
      expect(ciphertext[0]).toBe(1); // version 1
    });

    it('ciphertext is longer than plaintext (IV + auth tag)', async () => {
      const dek = await generateDek();
      const plaintext = new Uint8Array([1, 2, 3]);
      const ciphertext = await encrypt(plaintext, dek);
      // 1 (version) + 12 (IV) + 3 (data) + 16 (auth tag) = 32
      expect(ciphertext.length).toBeGreaterThan(plaintext.length);
    });

    it('each encryption produces unique ciphertext (random IV)', async () => {
      const dek = await generateDek();
      const plaintext = new Uint8Array([1, 2, 3]);
      const ct1 = await encrypt(plaintext, dek);
      const ct2 = await encrypt(plaintext, dek);
      expect(ct1).not.toEqual(ct2);
    });

    it('unsupported version throws', async () => {
      const dek = await generateDek();
      const data = new Uint8Array([99, 0, 0, 0, 0]); // version 99
      await expect(decrypt(data, dek)).rejects.toThrow('Unsupported encryption version');
    });

    it('empty data round-trip', async () => {
      const dek = await generateDek();
      const plaintext = new Uint8Array(0);
      const ciphertext = await encrypt(plaintext, dek);
      const result = await decrypt(ciphertext, dek);
      expect(result).toEqual(plaintext);
    });

    it('large data round-trip', async () => {
      const dek = await generateDek();
      const plaintext = globalThis.crypto.getRandomValues(new Uint8Array(10_000));
      const ciphertext = await encrypt(plaintext, dek);
      const result = await decrypt(ciphertext, dek);
      expect(result).toEqual(plaintext);
    });
  });
});
