import { describe, it, expect } from 'vitest';
import {
  pbkdf2DeriveKey as deriveKey,
  aesGcmGenerateKey as generateDek,
  exportCryptoKey as exportDek,
  importAesGcmKey as importDek,
  aesGcmEncrypt as encrypt,
  aesGcmDecrypt as decrypt,
} from '@strata/utils';
import { InvalidEncryptionKeyError } from '@strata/adapter';

describe('Encryption primitives', () => {
  const appId = 'test-app';

  describe('deriveKey', () => {
    it('produces a CryptoKey from password+appId', async () => {
      const key = await deriveKey('password', appId);
      expect(key).toBeDefined();
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM' });
    });

    it('same inputs produce same key', async () => {
      const key1 = await deriveKey('password', appId);
      const key2 = await deriveKey('password', appId);
      const data = new TextEncoder().encode('test');
      const encrypted = await encrypt(data, key1);
      const decrypted = await decrypt(encrypted, key2);
      expect(decrypted).toEqual(data);
    });

    it('different passwords produce different keys', async () => {
      const key1 = await deriveKey('password1', appId);
      const key2 = await deriveKey('password2', appId);
      const data = new TextEncoder().encode('test');
      const encrypted = await encrypt(data, key1);
      await expect(decrypt(encrypted, key2)).rejects.toThrow();
    });

    it('different appIds produce different keys', async () => {
      const key1 = await deriveKey('password', 'app-1');
      const key2 = await deriveKey('password', 'app-2');
      const data = new TextEncoder().encode('test');
      const encrypted = await encrypt(data, key1);
      await expect(decrypt(encrypted, key2)).rejects.toThrow();
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

  describe('exportDek / importDek', () => {
    it('round-trips DEK through base64', async () => {
      const dek = await generateDek();
      const b64 = await exportDek(dek);
      const imported = await importDek(b64);

      const original = await globalThis.crypto.subtle.exportKey('raw', dek);
      const recovered = await globalThis.crypto.subtle.exportKey('raw', imported);
      expect(new Uint8Array(recovered)).toEqual(new Uint8Array(original));
    });

    it('exported DEK is a base64 string', async () => {
      const dek = await generateDek();
      const b64 = await exportDek(dek);
      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);
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
      const data = new Uint8Array(14); // minimum length, version 0 → unsupported
      data[0] = 99;
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
