import { describe, it, expect } from 'vitest';
import { Pbkdf2EncryptionService, AesGcmEncryptionStrategy } from '@strata/adapter/encryption';
import { InvalidEncryptionKeyError } from '@strata/adapter/crypto';

describe('Pbkdf2EncryptionService', () => {
  const appId = 'test-app';

  function createService(): Pbkdf2EncryptionService {
    const svc = new Pbkdf2EncryptionService({ targets: ['local'], strategy: new AesGcmEncryptionStrategy() });
    ;
    return svc;
  }

  it('passthrough when not activated', async () => {
    const svc = createService();
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await svc.encrypt('task.global', data);
    expect(encoded).toEqual(data);
    const decoded = await svc.decrypt('task.global', encoded);
    expect(decoded).toEqual(data);
  });

  it('always passes through __tenants key', async () => {
    const svc = createService();
    await svc.activate('password', appId);
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await svc.encrypt('__tenants', data);
    expect(encoded).toEqual(data);
  });

  it('encrypts/decrypts __strata with KEK', async () => {
    const svc = createService();
    await svc.activate('password', appId);
    const data = new TextEncoder().encode('marker data');
    const encrypted = await svc.encrypt('__strata', data);
    expect(encrypted).not.toEqual(data);
    expect(encrypted[0]).toBe(1); // version byte
    const decrypted = await svc.decrypt('__strata', encrypted);
    expect(decrypted).toEqual(data);
  });

  it('wrong credential fails to decrypt __strata', async () => {
    const svc1 = createService();
    await svc1.activate('correct', appId);
    const data = new TextEncoder().encode('secret');
    const encrypted = await svc1.encrypt('__strata', data);

    const svc2 = createService();
    await svc2.activate('wrong', appId);
    await expect(svc2.decrypt('__strata', encrypted))
      .rejects.toThrow(InvalidEncryptionKeyError);
  });

  it('encrypts/decrypts data blobs with DEK', async () => {
    const svc = createService();
    await svc.activate('password', appId);
    const keyData = await svc.generateKeyData();
    expect(keyData).toBeDefined();
    const data = new TextEncoder().encode('entity data');
    const encrypted = await svc.encrypt('task.global', data);
    expect(encrypted).not.toEqual(data);
    const decrypted = await svc.decrypt('task.global', encrypted);
    expect(decrypted).toEqual(data);
  });

  it('deactivate resets state', async () => {
    const svc = createService();
    await svc.activate('password', appId);
    expect(svc.isActive).toBe(true);
    svc.deactivate();
    expect(svc.isActive).toBe(false);
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await svc.encrypt('__strata', data);
    expect(encoded).toEqual(data);
  });

  it('generateKeyData produces loadable key data', async () => {
    const svc = createService();
    await svc.activate('password', appId);
    const keyData = await svc.generateKeyData();
    expect(keyData).toBeDefined();
    expect(typeof keyData!.dek).toBe('string');
    expect((keyData!.dek as string).length).toBeGreaterThan(0);
  });

  it('loadKeyData restores DEK from key data', async () => {
    const svc1 = createService();
    await svc1.activate('password', appId);
    const keyData = await svc1.generateKeyData();

    const data = new TextEncoder().encode('test data');
    const encrypted = await svc1.encrypt('task.global', data);

    // New service instance loads the same key data
    const svc2 = createService();
    await svc2.activate('password', appId);
    await svc2.loadKeyData(keyData!);
    const decrypted = await svc2.decrypt('task.global', encrypted);
    expect(decrypted).toEqual(data);
  });

  it('rekey re-wraps DEK under new credential', async () => {
    const svc = createService();
    await svc.activate('old-password', appId);
    const keyData = await svc.generateKeyData();

    const data = new TextEncoder().encode('important data');
    const encrypted = await svc.encrypt('task.global', data);

    // Rekey with new password
    const newKeyData = await svc.rekey('new-password', appId);
    expect(newKeyData).toBeDefined();

    // Data still decryptable (same DEK)
    const decrypted = await svc.decrypt('task.global', encrypted);
    expect(decrypted).toEqual(data);
  });
});

