import { describe, it, expect, afterEach } from 'vitest';
import { MemoryStorageAdapter, InvalidEncryptionKeyError } from '@strata/adapter';
import { Strata, defineEntity } from '@strata/index';
import type { Repository } from '@strata/repo';

type Task = { title: string; done: boolean };
const TaskDef = defineEntity<Task>('task');

describe('Per-tenant encrypted Strata lifecycle', () => {
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

  function createStrata(storage?: MemoryStorageAdapter): Strata {
    return track(new Strata({
      appId,
      entities: [TaskDef],
      localAdapter: storage ?? new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    }));
  }

  it('encrypted tenant: save, dispose, reload with password', async () => {
    const storage = new MemoryStorageAdapter();

    // Phase 1: create encrypted tenant, save data
    const strata1 = createStrata(storage);
    const tenant = await strata1.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'secret' },
    });
    await strata1.loadTenant(tenant.id, { password: 'secret' });
    const repo1 = strata1.repo(TaskDef) as Repository<Task>;
    repo1.save({ title: 'Encrypted task', done: false });
    await strata1.dispose();

    // Phase 2: reload with same password
    const strata2 = createStrata(storage);
    await strata2.loadTenant(tenant.id, { password: 'secret' });
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const tasks = repo2.query();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Encrypted task');
  });

  it('encrypted tenant: wrong password throws InvalidEncryptionKeyError', async () => {
    const storage = new MemoryStorageAdapter();
    const strata1 = createStrata(storage);
    await strata1.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'correct' },
    });
    await strata1.dispose();

    const strata2 = createStrata(storage);
    // Wrong password should throw
    await expect(strata2.loadTenant('Encrypted', { password: 'wrong' }))
      .rejects.toThrow();
  });

  it('encrypted tenant: no password throws', async () => {
    const storage = new MemoryStorageAdapter();
    const strata1 = createStrata(storage);
    const tenant = await strata1.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'secret' },
    });
    await strata1.dispose();

    const strata2 = createStrata(storage);
    await expect(strata2.loadTenant(tenant.id))
      .rejects.toThrow('Password required for encrypted tenant');
  });

  it('unencrypted tenant: loads without password', async () => {
    const storage = new MemoryStorageAdapter();
    const strata1 = createStrata(storage);
    const tenant = await strata1.tenants.create({
      name: 'Plain',
      meta: {},
    });
    await strata1.loadTenant(tenant.id);
    const repo = strata1.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Plain task', done: false });
    await strata1.dispose();

    const strata2 = createStrata(storage);
    await strata2.loadTenant(tenant.id);
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    expect(repo2.query().length).toBe(1);
  });

  it('mixed tenants: one encrypted, one plain on same adapter', async () => {
    const storage = new MemoryStorageAdapter();
    const strata = createStrata(storage);

    const encTenant = await strata.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'secret' },
    });
    const plainTenant = await strata.tenants.create({
      name: 'Plain',
      meta: {},
    });

    // Load encrypted tenant
    await strata.loadTenant(encTenant.id, { password: 'secret' });
    strata.repo(TaskDef).save({ title: 'Secret data', done: false });

    // Switch to plain tenant
    await strata.loadTenant(plainTenant.id);
    strata.repo(TaskDef).save({ title: 'Public data', done: false });

    // Switch back to encrypted
    await strata.loadTenant(encTenant.id, { password: 'secret' });
    const tasks = strata.repo(TaskDef).query();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Secret data');
  });
});
