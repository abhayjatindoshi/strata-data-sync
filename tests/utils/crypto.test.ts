import { describe, it, expect } from 'vitest';
import {
  pbkdf2DeriveKey,
  pbkdf2DeriveKeyWithSalt,
  aesGcmGenerateKey,
  exportCryptoKey,
  importAesGcmKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
} from '@strata/utils';

describe('crypto utilities', () => {
  describe('pbkdf2DeriveKey', () => {
    it('derives an AES-GCM key from password and salt string', async () => {
      const key = await pbkdf2DeriveKey('password', 'test-app');
      expect(key).toBeDefined();
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM' });
    });

    it('same inputs produce functionally same key', async () => {
      const key1 = await pbkdf2DeriveKey('password', 'app');
      const key2 = await pbkdf2DeriveKey('password', 'app');
      const data = new TextEncoder().encode('test');
      const encrypted = await aesGcmEncrypt(data, key1);
      const decrypted = await aesGcmDecrypt(encrypted, key2);
      expect(decrypted).toEqual(data);
    });

    it('different passwords produce different keys', async () => {
      const key1 = await pbkdf2DeriveKey('pass1', 'app');
      const key2 = await pbkdf2DeriveKey('pass2', 'app');
      const data = new TextEncoder().encode('test');
      const encrypted = await aesGcmEncrypt(data, key1);
      await expect(aesGcmDecrypt(encrypted, key2)).rejects.toThrow();
    });
  });

  describe('pbkdf2DeriveKeyWithSalt', () => {
    it('derives key from raw salt bytes', async () => {
      const salt = new TextEncoder().encode('raw-salt');
      const key = await pbkdf2DeriveKeyWithSalt('password', salt);
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM' });
    });
  });

  describe('aesGcmGenerateKey', () => {
    it('produces extractable AES-256-GCM key', async () => {
      const key = await aesGcmGenerateKey();
      expect(key.extractable).toBe(true);
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    });

    it('generates unique keys', async () => {
      const k1 = await aesGcmGenerateKey();
      const k2 = await aesGcmGenerateKey();
      const raw1 = await globalThis.crypto.subtle.exportKey('raw', k1);
      const raw2 = await globalThis.crypto.subtle.exportKey('raw', k2);
      expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2));
    });
  });

  describe('exportCryptoKey / importAesGcmKey', () => {
    it('round-trips key through base64', async () => {
      const key = await aesGcmGenerateKey();
      const b64 = await exportCryptoKey(key);
      const imported = await importAesGcmKey(b64);
      const orig = await globalThis.crypto.subtle.exportKey('raw', key);
      const recovered = await globalThis.crypto.subtle.exportKey('raw', imported);
      expect(new Uint8Array(recovered)).toEqual(new Uint8Array(orig));
    });

    it('exported key is a non-empty string', async () => {
      const key = await aesGcmGenerateKey();
      const b64 = await exportCryptoKey(key);
      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);
    });

    it('importAesGcmKey throws on invalid base64', async () => {
      await expect(importAesGcmKey('!!!bad!!!')).rejects.toThrow('Invalid base64');
    });
  });

  describe('aesGcmEncrypt / aesGcmDecrypt', () => {
    it('round-trips data', async () => {
      const key = await aesGcmGenerateKey();
      const data = new TextEncoder().encode('Hello, World!');
      const encrypted = await aesGcmEncrypt(data, key);
      const decrypted = await aesGcmDecrypt(encrypted, key);
      expect(decrypted).toEqual(data);
    });

    it('ciphertext starts with version byte 1', async () => {
      const key = await aesGcmGenerateKey();
      const encrypted = await aesGcmEncrypt(new Uint8Array([1, 2, 3]), key);
      expect(encrypted[0]).toBe(1);
    });

    it('rejects data too short', async () => {
      const key = await aesGcmGenerateKey();
      const short = new Uint8Array(5);
      await expect(aesGcmDecrypt(short, key)).rejects.toThrow('too short');
    });

    it('rejects unsupported version', async () => {
      const key = await aesGcmGenerateKey();
      const data = new TextEncoder().encode('test');
      const encrypted = await aesGcmEncrypt(data, key);
      encrypted[0] = 99; // wrong version
      await expect(aesGcmDecrypt(encrypted, key)).rejects.toThrow('Unsupported encryption version');
    });

    it('wrong key fails to decrypt', async () => {
      const key1 = await aesGcmGenerateKey();
      const key2 = await aesGcmGenerateKey();
      const data = new TextEncoder().encode('secret');
      const encrypted = await aesGcmEncrypt(data, key1);
      await expect(aesGcmDecrypt(encrypted, key2)).rejects.toThrow();
    });
  });
});
