import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
} from '@strata/index';
import type { Strata, BlobAdapter } from '@strata/index';
import type { Repository } from '@strata/repo';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('Lifecycle advanced integration', () => {
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

  it('empty entity definitions throws', () => {
    expect(() => createStrata({
      entities: [],
      localAdapter: createMemoryBlobAdapter(),
      deviceId: 'dev-1',
    })).toThrow('At least one entity definition is required');
  });

  it('duplicate entity names throws', () => {
    const TaskDef2 = defineEntity<Task>('task');

    expect(() => createStrata({
      entities: [TaskDef, TaskDef2],
      localAdapter: createMemoryBlobAdapter(),
      deviceId: 'dev-1',
    })).toThrow('Duplicate entity name: task');
  });

  it('data persists to local adapter on dispose', async () => {
    const innerAdapter = createMemoryBlobAdapter();

    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter: innerAdapter,
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { b: 1 },
    });
    await strata.tenants.load(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    for (let i = 0; i < 5; i++) {
      repo.save({ title: `Task ${i}`, done: false });
    }

    await strata.dispose();

    // After dispose, data should be flushed to local adapter
    const keys = await innerAdapter.list(tenant, 'task.');
    expect(keys.length).toBeGreaterThan(0);
  });

  it('tenant load triggers hydrate from cloud automatically', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    // Device A: create, save, sync
    const localA = createMemoryBlobAdapter();
    const strataA = track(createStrata({
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false });
    await strataA.sync();

    // Device B: load tenant → auto-hydrate from cloud (no explicit sync needed)
    const localB = createMemoryBlobAdapter();
    const strataB = track(createStrata({
      entities: [TaskDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'device-B',
    }));
    await strataB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    const entity = repoB.get(id);
    expect(entity).toBeDefined();
    expect(entity!.title).toBe('From A');
  });
});
