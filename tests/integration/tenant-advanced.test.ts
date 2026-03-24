import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
  saveTenantPrefs,
  loadTenantPrefs,
  pushTenantList,
  pullTenantList,
  loadTenantList,
} from '@strata/index';
import type { Strata } from '@strata/index';

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
    const sharedCloud = createMemoryBlobAdapter();
    const meta = { folder: 'shared' };

    // Device A saves prefs to cloud
    await saveTenantPrefs(sharedCloud, meta, {
      name: 'My Workspace',
      icon: '🚀',
      color: '#FF0000',
    });

    // Device B loads prefs from cloud
    const loaded = await loadTenantPrefs(sharedCloud, meta);

    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('My Workspace');
    expect(loaded!.icon).toBe('🚀');
    expect(loaded!.color).toBe('#FF0000');
  });

  it('tenant list multi-device merge — A creates X, B creates Y, both end up with both', async () => {
    const sharedCloud = createMemoryBlobAdapter();
    const localA = createMemoryBlobAdapter();
    const localB = createMemoryBlobAdapter();

    // Device A creates tenant X
    const strataA = track(createStrata({
      entities: [TaskDef],
      localAdapter: localA,
      deviceId: 'dev-A',
    }));
    await strataA.tenants.create({ name: 'Tenant X', meta: { b: 'x' } });

    // Device B creates tenant Y
    const strataB = track(createStrata({
      entities: [TaskDef],
      localAdapter: localB,
      deviceId: 'dev-B',
    }));
    await strataB.tenants.create({ name: 'Tenant Y', meta: { b: 'y' } });

    // A pushes → cloud = [X]
    await pushTenantList(localA, sharedCloud);

    // B pulls → B merges local [Y] with cloud [X] → B has [X, Y]
    await pullTenantList(localB, sharedCloud);

    // B pushes → cloud = [X, Y]
    await pushTenantList(localB, sharedCloud);

    // A pulls → A merges local [X] with cloud [X, Y] → A has [X, Y]
    await pullTenantList(localA, sharedCloud);

    // Both should have both tenants
    const listA = await loadTenantList(localA);
    const listB = await loadTenantList(localB);

    expect(listA).toHaveLength(2);
    expect(listB).toHaveLength(2);

    const namesA = listA.map(t => t.name).sort();
    const namesB = listB.map(t => t.name).sort();
    expect(namesA).toEqual(['Tenant X', 'Tenant Y']);
    expect(namesB).toEqual(['Tenant X', 'Tenant Y']);
  });
});
