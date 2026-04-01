import { describe, it, expect } from 'vitest';
import { EncryptionTransformService, createEncryptedMarkerDek } from '@strata/adapter/encryption';
import { InvalidEncryptionKeyError } from '@strata/adapter/crypto';

describe('EncryptionTransformService', () => {
  const appId = 'test-app';
  const defaultOpts = { targets: [] as ('local' | 'cloud')[], tenantKey: '__tenants', markerKey: '__strata' };

  it('passthrough when not configured', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await svc.encrypt(data, 'task.global');
    expect(encoded).toEqual(data);
    const decoded = await svc.decrypt(encoded, 'task.global');
    expect(decoded).toEqual(data);
  });

  it('always passes through __tenants key', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await svc.encrypt(data, '__tenants');
    expect(encoded).toEqual(data);
  });

  it('encrypts/decrypts __strata with markerKey', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    const data = new TextEncoder().encode('marker data');
    const encrypted = await svc.encrypt(data, '__strata');
    expect(encrypted).not.toEqual(data);
    expect(encrypted[0]).toBe(1); // version byte
    const decrypted = await svc.decrypt(encrypted, '__strata');
    expect(decrypted).toEqual(data);
  });

  it('wrong password fails to decrypt __strata', async () => {
    const svc1 = new EncryptionTransformService(defaultOpts);
    await svc1.setup('correct', appId);
    const data = new TextEncoder().encode('secret');
    const encrypted = await svc1.encrypt(data, '__strata');

    const svc2 = new EncryptionTransformService(defaultOpts);
    await svc2.setup('wrong', appId);
    await expect(svc2.decrypt(encrypted, '__strata'))
      .rejects.toThrow(InvalidEncryptionKeyError);
  });

  it('encrypts/decrypts data blobs with DEK', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    const { dek } = await createEncryptedMarkerDek();
    svc.setDek(dek);
    const data = new TextEncoder().encode('entity data');
    const encrypted = await svc.encrypt(data, 'task.global');
    expect(encrypted).not.toEqual(data);
    const decrypted = await svc.decrypt(encrypted, 'task.global');
    expect(decrypted).toEqual(data);
  });

  it('clear resets state', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    expect(svc.isConfigured).toBe(true);
    svc.clear();
    expect(svc.isConfigured).toBe(false);
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await svc.encrypt(data, '__strata');
    expect(encoded).toEqual(data);
  });

  it('createEncryptedMarkerDek generates base64 dek', async () => {
    const { dek, dekBase64 } = await createEncryptedMarkerDek();
    expect(dek).toBeDefined();
    expect(typeof dekBase64).toBe('string');
    expect(dekBase64.length).toBeGreaterThan(0);
  });
});
