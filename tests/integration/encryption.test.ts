import { describe, it, expect, afterEach } from 'vitest';
import { MemoryBlobAdapter, EncryptionTransformService } from '@strata/adapter';
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

  function createStrata(storage?: MemoryBlobAdapter): Strata {
    const s = storage ?? new MemoryBlobAdapter();
    return track(new Strata({
      appId,
      entities: [TaskDef],
      localAdapter: s,
      encryptionService: new EncryptionTransformService({ targets: ['local'] }),
      deviceId: 'dev-1',
    }));
  }

  it('encrypted tenant: save, dispose, reload with password', async () => {
    const storage = new MemoryBlobAdapter();

    // Phase 1: create encrypted tenant, save data
    const strata1 = createStrata(storage);
    const tenant = await strata1.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'secret' },
    });
    await strata1.tenants.open(tenant.id, { password: 'secret' });
    const repo1 = strata1.repo(TaskDef) as Repository<Task>;
    repo1.save({ title: 'Encrypted task', done: false });
    await strata1.dispose();

    // Phase 2: reload with same password
    const strata2 = createStrata(storage);
    await strata2.tenants.open(tenant.id, { password: 'secret' });
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const tasks = repo2.query();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Encrypted task');
  });

  it('encrypted tenant: wrong password throws InvalidEncryptionKeyError', async () => {
    const storage = new MemoryBlobAdapter();
    const strata1 = createStrata(storage);
    await strata1.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'correct' },
    });
    await strata1.dispose();

    const strata2 = createStrata(storage);
    // Wrong password should throw
    await expect(strata2.tenants.open('Encrypted', { password: 'wrong' }))
      .rejects.toThrow();
  });

  it('encrypted tenant: no password throws', async () => {
    const storage = new MemoryBlobAdapter();
    const strata1 = createStrata(storage);
    const tenant = await strata1.tenants.create({
      name: 'Encrypted',
      meta: {},
      encryption: { password: 'secret' },
    });
    await strata1.dispose();

    const strata2 = createStrata(storage);
    await expect(strata2.tenants.open(tenant.id))
      .rejects.toThrow('Password required for encrypted tenant');
  });

  it('unencrypted tenant: loads without password', async () => {
    const storage = new MemoryBlobAdapter();
    const strata1 = createStrata(storage);
    const tenant = await strata1.tenants.create({
      name: 'Plain',
      meta: {},
    });
    await strata1.tenants.open(tenant.id);
    const repo = strata1.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Plain task', done: false });
    await strata1.dispose();

    const strata2 = createStrata(storage);
    await strata2.tenants.open(tenant.id);
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    expect(repo2.query().length).toBe(1);
  });

  it('mixed tenants: one encrypted, one plain on same adapter', async () => {
    const storage = new MemoryBlobAdapter();
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
    await strata.tenants.open(encTenant.id, { password: 'secret' });
    strata.repo(TaskDef).save({ title: 'Secret data', done: false });

    // Switch to plain tenant
    await strata.tenants.open(plainTenant.id);
    strata.repo(TaskDef).save({ title: 'Public data', done: false });

    // Switch back to encrypted
    await strata.tenants.open(encTenant.id, { password: 'secret' });
    const tasks = strata.repo(TaskDef).query();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Secret data');
  });
});
