import { describe, it, expect } from 'vitest';
import { MemoryStorageAdapter, MemoryBlobAdapter, AdapterBridge } from '@strata/adapter';
import { EncryptionTransformService, createEncryptedMarkerDek } from '@strata/adapter/encryption';
import { InvalidEncryptionKeyError, encrypt, generateDek, exportDek } from '@strata/adapter/crypto';
import { serialize, deserialize } from '@strata/persistence';
import type { PartitionBlob } from '@strata/persistence';

describe('EncryptionTransformService', () => {
  const appId = 'test-app';
  const defaultOpts = { tenantKey: '__tenants', markerKey: '__strata' };

  it('passthrough when not configured', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    const transform = svc.toTransform();
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await transform.encode(undefined, 'task.global', data);
    expect(encoded).toEqual(data);
    const decoded = await transform.decode(undefined, 'task.global', encoded);
    expect(decoded).toEqual(data);
  });

  it('always passes through __tenants key', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    const transform = svc.toTransform();
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await transform.encode(undefined, '__tenants', data);
    expect(encoded).toEqual(data);
  });

  it('encrypts/decrypts __strata with markerKey', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    const transform = svc.toTransform();
    const data = new TextEncoder().encode('marker data');
    const encrypted = await transform.encode(undefined, '__strata', data);
    expect(encrypted).not.toEqual(data);
    expect(encrypted[0]).toBe(1); // version byte
    const decrypted = await transform.decode(undefined, '__strata', encrypted);
    expect(decrypted).toEqual(data);
  });

  it('wrong password fails to decrypt __strata', async () => {
    const svc1 = new EncryptionTransformService(defaultOpts);
    await svc1.setup('correct', appId);
    const data = new TextEncoder().encode('secret');
    const encrypted = await svc1.toTransform().encode(undefined, '__strata', data);

    const svc2 = new EncryptionTransformService(defaultOpts);
    await svc2.setup('wrong', appId);
    await expect(svc2.toTransform().decode(undefined, '__strata', encrypted))
      .rejects.toThrow(InvalidEncryptionKeyError);
  });

  it('encrypts/decrypts data blobs with DEK', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    const { dek } = await createEncryptedMarkerDek();
    svc.setDek(dek);
    const transform = svc.toTransform();
    const data = new TextEncoder().encode('entity data');
    const encrypted = await transform.encode(undefined, 'task.global', data);
    expect(encrypted).not.toEqual(data);
    const decrypted = await transform.decode(undefined, 'task.global', encrypted);
    expect(decrypted).toEqual(data);
  });

  it('clear resets state', async () => {
    const svc = new EncryptionTransformService(defaultOpts);
    await svc.setup('password', appId);
    expect(svc.isConfigured).toBe(true);
    svc.clear();
    expect(svc.isConfigured).toBe(false);
    // After clear, data passes through
    const transform = svc.toTransform();
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await transform.encode(undefined, '__strata', data);
    expect(encoded).toEqual(data);
  });

  it('createEncryptedMarkerDek generates base64 dek', async () => {
    const { dek, dekBase64 } = await createEncryptedMarkerDek();
    expect(dek).toBeDefined();
    expect(typeof dekBase64).toBe('string');
    expect(dekBase64.length).toBeGreaterThan(0);
  });
});
