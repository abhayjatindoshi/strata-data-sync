import { describe, it, expect } from 'vitest';
import { MemoryStorageAdapter } from '@strata/adapter';
import {
  initEncryption, changeEncryptionPassword,
  enableEncryption, disableEncryption,
} from '@strata/adapter/encryption';
import { InvalidEncryptionKeyError } from '@strata/adapter/crypto';
import { serialize, deserialize } from '@strata/persistence';

describe('Encryption lifecycle', () => {
  const appId = 'test-app';

  describe('initEncryption', () => {
    it('bootstraps new encryption on first call', async () => {
      const storage = new MemoryStorageAdapter();
      const ctx = await initEncryption(storage, appId, 'password');
      expect(ctx.dek).toBeDefined();
      expect(ctx.salt.length).toBe(16);
      expect(ctx.encrypt).toBeTypeOf('function');
      expect(ctx.decrypt).toBeTypeOf('function');
    });

    it('stores salt and DEK in storage', async () => {
      const storage = new MemoryStorageAdapter();
      await initEncryption(storage, appId, 'password');
      const salt = await storage.read(undefined, `${appId}/__strata_salt`);
      const dek = await storage.read(undefined, `${appId}/__strata_dek`);
      expect(salt).not.toBeNull();
      expect(dek).not.toBeNull();
    });

    it('loads existing DEK on subsequent call', async () => {
      const storage = new MemoryStorageAdapter();
      const ctx1 = await initEncryption(storage, appId, 'password');

      // Encrypt some data
      const plaintext = new Uint8Array([1, 2, 3]);
      const encrypted = await ctx1.encrypt(plaintext);

      // Re-init with same password
      const ctx2 = await initEncryption(storage, appId, 'password');
      const decrypted = await ctx2.decrypt(encrypted);
      expect(decrypted).toEqual(plaintext);
    });

    it('wrong password throws InvalidEncryptionKeyError', async () => {
      const storage = new MemoryStorageAdapter();
      await initEncryption(storage, appId, 'correct');
      await expect(initEncryption(storage, appId, 'wrong'))
        .rejects.toThrow(InvalidEncryptionKeyError);
    });
  });

  describe('changeEncryptionPassword', () => {
    it('allows re-init with new password after change', async () => {
      const storage = new MemoryStorageAdapter();
      const ctx1 = await initEncryption(storage, appId, 'old-pass');
      const plaintext = new Uint8Array([10, 20, 30]);
      const encrypted = await ctx1.encrypt(plaintext);

      await changeEncryptionPassword(storage, appId, 'old-pass', 'new-pass');

      // Old password no longer works
      await expect(initEncryption(storage, appId, 'old-pass'))
        .rejects.toThrow(InvalidEncryptionKeyError);

      // New password works and can decrypt data encrypted with original DEK
      const ctx2 = await initEncryption(storage, appId, 'new-pass');
      const decrypted = await ctx2.decrypt(encrypted);
      expect(decrypted).toEqual(plaintext);
    });

    it('throws when no encryption is configured', async () => {
      const storage = new MemoryStorageAdapter();
      await expect(changeEncryptionPassword(storage, appId, 'old', 'new'))
        .rejects.toThrow('No encryption configured');
    });
  });

  describe('enableEncryption', () => {
    it('encrypts existing unencrypted blobs', async () => {
      const storage = new MemoryStorageAdapter();
      const data = { task: { id1: { id: 'id1', title: 'test' } }, deleted: {} };
      const serialized = serialize(data);
      await storage.write(undefined, `${appId}/task.global`, serialized);

      const ctx = await enableEncryption(storage, appId, 'password');

      // Raw data should now be encrypted (different from original)
      const raw = await storage.read(undefined, `${appId}/task.global`);
      expect(raw).not.toEqual(serialized);

      // But can be decrypted
      const decrypted = await ctx.decrypt(raw!);
      const restored = deserialize(decrypted);
      expect(restored).toEqual(data);
    });
  });

  describe('disableEncryption', () => {
    it('decrypts all encrypted blobs and removes salt/DEK', async () => {
      const storage = new MemoryStorageAdapter();
      const ctx = await initEncryption(storage, appId, 'password');

      // Write encrypted data
      const data = { task: { id1: { id: 'id1' } }, deleted: {} };
      const encrypted = await ctx.encrypt(serialize(data));
      await storage.write(undefined, `${appId}/task.global`, encrypted);

      await disableEncryption(storage, appId, 'password');

      // Salt and DEK should be removed
      const salt = await storage.read(undefined, `${appId}/__strata_salt`);
      const dek = await storage.read(undefined, `${appId}/__strata_dek`);
      expect(salt).toBeNull();
      expect(dek).toBeNull();

      // Data should now be plain (readable without decryption)
      const raw = await storage.read(undefined, `${appId}/task.global`);
      const restored = deserialize(raw!);
      expect(restored).toEqual(data);
    });

    it('wrong password throws', async () => {
      const storage = new MemoryStorageAdapter();
      await initEncryption(storage, appId, 'correct');
      await expect(disableEncryption(storage, appId, 'wrong'))
        .rejects.toThrow(InvalidEncryptionKeyError);
    });
  });
});
