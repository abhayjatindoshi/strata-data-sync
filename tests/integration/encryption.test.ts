import { describe, it, expect, afterEach } from 'vitest';
import {
  AdapterBridge, MemoryStorageAdapter,
  initEncryption, changeEncryptionPassword,
  enableEncryption, disableEncryption,
  encryptionTransform,
  InvalidEncryptionKeyError,
} from '@strata/adapter';
import { createStrata, defineEntity } from '@strata/index';
import type { Strata, Repository } from '@strata/index';

type Task = { title: string; done: boolean };
const TaskDef = defineEntity<Task>('task');

describe('Encrypted Strata lifecycle integration', () => {
  const appId = 'enc-test';
  const instances: Strata[] = [];

  afterEach(async () => {
    for (const s of instances) {
      await s.dispose().catch(() => {});
    }
    instances.length = 0;
  });

  function track(s: Strata): Strata {
    instances.push(s);
    return s;
  }

  it('init with password, save entities, dispose, re-init reads data', async () => {
    const storage = new MemoryStorageAdapter();

    // Phase 1: init encrypted, save data
    const ctx1 = await initEncryption(storage, appId, 'secret');
    const bridge1 = new AdapterBridge(storage, appId, { transforms: [encryptionTransform(ctx1)] });
    const strata1 = track(createStrata({
      appId,
      entities: [TaskDef],
      localAdapter: bridge1,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'Test', meta: {} });
    await strata1.loadTenant(tenant.id);
    const repo1 = strata1.repo(TaskDef) as Repository<Task>;
    repo1.save({ title: 'Encrypted task', done: false });
    await strata1.dispose();

    // Phase 2: re-init with same password, verify data
    const ctx2 = await initEncryption(storage, appId, 'secret');
    const bridge2 = new AdapterBridge(storage, appId, { transforms: [encryptionTransform(ctx2)] });
    const strata2 = track(createStrata({
      appId,
      entities: [TaskDef],
      localAdapter: bridge2,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const tasks = repo2.query();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Encrypted task');
  });

  it('re-init with wrong password throws', async () => {
    const storage = new MemoryStorageAdapter();
    await initEncryption(storage, appId, 'correct');

    await expect(initEncryption(storage, appId, 'wrong'))
      .rejects.toThrow(InvalidEncryptionKeyError);
  });

  it('password change: new password works, old password throws', async () => {
    const storage = new MemoryStorageAdapter();

    // Init and save data
    const ctx1 = await initEncryption(storage, appId, 'old-pass');
    const bridge1 = new AdapterBridge(storage, appId, { transforms: [encryptionTransform(ctx1)] });
    const strata1 = track(createStrata({
      appId,
      entities: [TaskDef],
      localAdapter: bridge1,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'Test', meta: {} });
    await strata1.loadTenant(tenant.id);
    const repo1 = strata1.repo(TaskDef) as Repository<Task>;
    repo1.save({ title: 'Important data', done: true });
    await strata1.dispose();

    // Change password
    await changeEncryptionPassword(storage, appId, 'old-pass', 'new-pass');

    // Old password fails
    await expect(initEncryption(storage, appId, 'old-pass'))
      .rejects.toThrow(InvalidEncryptionKeyError);

    // New password works and data is accessible
    const ctx2 = await initEncryption(storage, appId, 'new-pass');
    const bridge2 = new AdapterBridge(storage, appId, { transforms: [encryptionTransform(ctx2)] });
    const strata2 = track(createStrata({
      appId,
      entities: [TaskDef],
      localAdapter: bridge2,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const tasks = repo2.query();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Important data');
  });

  it('enable encryption on unencrypted data at storage level', async () => {
    const storage = new MemoryStorageAdapter();
    const { serialize } = await import('@strata/persistence');

    // Write unencrypted data directly to storage (simulating existing blobs)
    const data = { task: { id1: { id: 'id1', title: 'Unencrypted' } }, deleted: {} };
    const serialized = serialize(data);
    await storage.write(undefined, `${appId}/task.global`, serialized);

    // Enable encryption
    const ctx = await enableEncryption(storage, appId, 'my-password');

    // Raw data should now be encrypted (first byte = version 1, not JSON's '{')
    const raw = await storage.read(undefined, `${appId}/task.global`);
    expect(raw).not.toBeNull();
    expect(raw![0]).toBe(1); // encryption version byte

    // But decrypting through the context should restore original
    const decrypted = await ctx.decrypt(raw!);
    const { deserialize } = await import('@strata/persistence');
    const restored = deserialize(decrypted);
    expect(restored).toEqual(data);
  });

  it('disable encryption restores plaintext at storage level', async () => {
    const storage = new MemoryStorageAdapter();
    const { serialize, deserialize } = await import('@strata/persistence');

    // Init encryption and write encrypted data
    const ctx1 = await initEncryption(storage, appId, 'secret');
    const data = { task: { id1: { id: 'id1', title: 'Was encrypted' } }, deleted: {} };
    const encrypted = await ctx1.encrypt(serialize(data));
    await storage.write(undefined, `${appId}/task.global`, encrypted);

    // Disable encryption
    await disableEncryption(storage, appId, 'secret');

    // Salt and DEK should be removed
    expect(await storage.read(undefined, `${appId}/__strata_salt`)).toBeNull();
    expect(await storage.read(undefined, `${appId}/__strata_dek`)).toBeNull();

    // Data should be plain JSON again
    const raw = await storage.read(undefined, `${appId}/task.global`);
    const restored = deserialize(raw!);
    expect(restored).toEqual(data);
  });
});
