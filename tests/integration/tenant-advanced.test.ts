import { describe, it, expect, afterEach } from 'vitest';
import {
  Strata,
  defineEntity,
  MemoryBlobAdapter,
  saveTenantPrefs,
  loadTenantPrefs,
  pushTenantList,
  pullTenantList,
  loadTenantList,
  resolveOptions,
} from '@strata/index';
import type { Tenant } from '@strata/index';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('Tenant advanced integration', () => {
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

  it('tenant preferences sync — save prefs on A, load on B via shared cloud', async () => {
    const sharedCloud = new MemoryBlobAdapter();
    const now = new Date();
    const tenant: Tenant = { id: 'prefs-test', name: 'Test', encrypted: false, meta: { folder: 'shared' }, createdAt: now, updatedAt: now };

    // Device A saves prefs to cloud
    await saveTenantPrefs(sharedCloud, tenant, {
      name: 'My Workspace',
    });

    // Device B loads prefs from cloud
    const loaded = await loadTenantPrefs(sharedCloud, tenant);

    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('My Workspace');
  });

  it('tenant list multi-device merge — A creates X, B creates Y, both end up with both', async () => {
    const sharedCloud = new MemoryBlobAdapter();
    const localA = new MemoryBlobAdapter();
    const localB = new MemoryBlobAdapter();

    // Device A creates tenant X
    const strataA = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localA,
      deviceId: 'dev-A',
    }));
    await strataA.tenants.create({ name: 'Tenant X', meta: { b: 'x' } });

    // Device B creates tenant Y
    const strataB = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localB,
      deviceId: 'dev-B',
    }));
    await strataB.tenants.create({ name: 'Tenant Y', meta: { b: 'y' } });

    const opts = resolveOptions();

    // A pushes → cloud = [X]
    await pushTenantList(localA, sharedCloud, opts);

    // B pulls → B merges local [Y] with cloud [X] → B has [X, Y]
    await pullTenantList(localB, sharedCloud, opts);

    // B pushes → cloud = [X, Y]
    await pushTenantList(localB, sharedCloud, opts);

    // A pulls → A merges local [X] with cloud [X, Y] → A has [X, Y]
    await pullTenantList(localA, sharedCloud, opts);

    // Both should have both tenants
    const listA = await loadTenantList(localA, opts);
    const listB = await loadTenantList(localB, opts);

    expect(listA).toHaveLength(2);
    expect(listB).toHaveLength(2);

    const namesA = listA.map(t => t.name).sort();
    const namesB = listB.map(t => t.name).sort();
    expect(namesA).toEqual(['Tenant X', 'Tenant Y']);
    expect(namesB).toEqual(['Tenant X', 'Tenant Y']);
  });
});
