import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
} from '@strata/index';
import type { Strata } from '@strata/index';
import type { Repository } from '@strata/repo';
import { loadAllIndexes } from '@strata/persistence';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('syncBetween integration', () => {
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

  async function createDevice(
    deviceId: string,
    cloudAdapter: ReturnType<typeof createMemoryBlobAdapter>,
  ) {
    const localAdapter = createMemoryBlobAdapter();
    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter,
      cloudAdapter,
      deviceId,
    }));
    return { strata, localAdapter };
  }

  it('deletedCount is tracked in partition index after flush and sync', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    const { strata: strataA, localAdapter } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Test',
      meta: { folder: 'test' },
    });
    await strataA.tenants.load(tenant.id);

    const repo = strataA.repo(TaskDef) as Repository<Task>;
    const id1 = repo.save({ title: 'Task 1', done: false });
    const id2 = repo.save({ title: 'Task 2', done: false });
    repo.delete(id2);

    await strataA.sync();

    const indexes = await loadAllIndexes(localAdapter, undefined);
    const taskIndex = indexes['task'];
    expect(taskIndex).toBeDefined();
    const partitionEntry = Object.values(taskIndex)[0];
    expect(partitionEntry).toBeDefined();
    expect(partitionEntry.deletedCount).toBeGreaterThanOrEqual(1);
  });

  it('syncBetween propagates data bidirectionally through full lifecycle', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    // Device A saves data and syncs
    const { strata: strataA } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const idA = repoA.save({ title: 'From A', done: false });
    await strataA.sync();

    // Device B saves different data and syncs
    const { strata: strataB } = await createDevice('device-B', sharedCloud);
    await strataB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    const idB = repoB.save({ title: 'From B', done: true });
    await strataB.sync();

    // Device A syncs again — should get B's data
    await strataA.sync();

    expect(repoA.get(idB)).toBeDefined();
    expect(repoA.get(idB)!.title).toBe('From B');

    // Device B should still have A's data from hydrate
    expect(repoB.get(idA)).toBeDefined();
    expect(repoB.get(idA)!.title).toBe('From A');
  });

  it('indexes are consistent on both local and cloud after sync', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    const { strata, localAdapter } = await createDevice('device-A', sharedCloud);
    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { folder: 'test' },
    });
    await strata.tenants.load(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Task 1', done: false });
    await strata.sync();

    const localIndexes = await loadAllIndexes(localAdapter, undefined);
    const cloudIndexes = await loadAllIndexes(sharedCloud, { folder: 'test' });

    const localEntry = localIndexes['task']?.['_'];
    const cloudEntry = cloudIndexes['task']?.['_'];

    expect(localEntry).toBeDefined();
    expect(cloudEntry).toBeDefined();
    expect(localEntry.hash).toBe(cloudEntry.hash);
    expect(localEntry.count).toBe(cloudEntry.count);
  });
});
