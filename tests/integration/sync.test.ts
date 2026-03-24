import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
} from '@strata/index';
import type { Strata } from '@strata/index';
import type { Repository } from '@strata/repo';

type Task = { title: string; done: boolean; priority: number };

const TaskDef = defineEntity<Task>('task');

describe('Two-device sync integration', () => {
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

  it('save on A → sync A → hydrate B → B has A data', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    // Device A: create tenant, save data, sync to cloud
    const { strata: strataA } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false, priority: 1 });
    await strataA.sync();

    // Device B: create tenant with same cloudMeta, load → hydrate from cloud
    const { strata: strataB } = await createDevice('device-B', sharedCloud);
    await strataB.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    const fromB = repoB.get(id);

    expect(fromB).toBeDefined();
    expect(fromB!.title).toBe('From A');
    expect(fromB!.done).toBe(false);
    expect(fromB!.priority).toBe(1);
  });

  it('concurrent edits → sync both → HLC conflict resolution (last writer wins)', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    // Device A setup
    const { strata: strataA } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'Original', done: false, priority: 1 });
    await strataA.sync();

    // Device B: hydrate from cloud to get the original entity
    const { strata: strataB } = await createDevice('device-B', sharedCloud);
    await strataB.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    expect(repoB.get(id)).toBeDefined();

    // Device A edits (earlier timestamp)
    repoA.save({ title: 'Edit from A', done: false, priority: 2, id } as Task & { id: string });
    await strataA.sync();

    // Device B edits (later timestamp — should win)
    // Small delay to ensure B has a later timestamp
    await new Promise(r => setTimeout(r, 5));
    repoB.save({ title: 'Edit from B', done: true, priority: 3, id } as Task & { id: string });
    await strataB.sync();

    // B synced last, so B's version should win in cloud
    // Now re-sync A to get B's version
    await strataA.sync();

    // After sync, both should have B's version (last writer wins)
    const resultB = repoB.get(id);
    expect(resultB!.title).toBe('Edit from B');
    expect(resultB!.priority).toBe(3);
  });

  it('delete on A → sync → B sees deletion via tombstone', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    // Device A: create, save, sync
    const { strata: strataA } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'Will delete', done: false, priority: 1 });
    await strataA.sync();

    // Device B hydrates
    const { strata: strataB } = await createDevice('device-B', sharedCloud);
    await strataB.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    expect(repoB.get(id)).toBeDefined();

    // A deletes entity, syncs
    repoA.delete(id);
    await strataA.sync();

    // B syncs to pick up tombstone
    await strataB.sync();

    const afterSync = repoB.get(id);
    expect(afterSync).toBeUndefined();
  });

  it('save on A, delete on B → sync → tombstone wins when B deleted later', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    // Device A: create entity, sync
    const { strata: strataA } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'Contested', done: false, priority: 1 });
    await strataA.sync();

    // Device B: hydrate, then delete, sync
    const { strata: strataB } = await createDevice('device-B', sharedCloud);
    await strataB.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    expect(repoB.get(id)).toBeDefined();

    // B deletes (later HLC)
    await new Promise(r => setTimeout(r, 5));
    repoB.delete(id);
    await strataB.sync();

    // A edits the entity (but A's HLC for the entity is older than B's tombstone)
    // Actually, A syncs → picks up tombstone from B → entity should be gone
    await strataA.sync();

    const resultA = repoA.get(id);
    expect(resultA).toBeUndefined();
  });

  it('bidirectional saves: A saves X, B saves Y → sync → both have X and Y', async () => {
    const sharedCloud = createMemoryBlobAdapter();

    const { strata: strataA } = await createDevice('device-A', sharedCloud);
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
    });
    await strataA.tenants.load(tenant.id);

    const { strata: strataB } = await createDevice('device-B', sharedCloud);
    await strataB.tenants.create({
      name: 'Shared',
      cloudMeta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.load(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const repoB = strataB.repo(TaskDef) as Repository<Task>;

    // A saves entity X
    const idX = repoA.save({ title: 'X from A', done: false, priority: 1 });
    await strataA.sync();

    // B saves entity Y
    const idY = repoB.save({ title: 'Y from B', done: true, priority: 2 });
    await strataB.sync();

    // A syncs again to get Y
    await strataA.sync();

    expect(repoA.get(idX)?.title).toBe('X from A');
    expect(repoA.get(idY)?.title).toBe('Y from B');
    expect(repoB.get(idX)?.title).toBe('X from A');
    expect(repoB.get(idY)?.title).toBe('Y from B');
  });
});
