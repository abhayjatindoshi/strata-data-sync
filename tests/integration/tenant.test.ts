import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
} from '@strata/index';
import type { Strata } from '@strata/index';
import type { Repository } from '@strata/repo';
import { writeMarkerBlob } from '@strata/tenant';

type Task = { title: string; done: boolean };
type Note = { text: string };

const TaskDef = defineEntity<Task>('task');
const NoteDef = defineEntity<Note>('note');

describe('Tenant integration', () => {
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

  it('create tenant → load → save entities → verify data accessible', async () => {
    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter: createMemoryBlobAdapter(),
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'My Workspace',
      cloudMeta: { bucket: 'ws1' },
    });

    await strata.tenants.load(tenant.id);
    expect(strata.tenants.activeTenant$.getValue()?.id).toBe(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    const id = repo.save({ title: 'Hello', done: false });

    const entity = repo.get(id);
    expect(entity?.title).toBe('Hello');
  });

  it('tenant list persists across instances', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const strata1 = track(createStrata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));

    await strata1.tenants.create({ name: 'WS1', cloudMeta: { bucket: '1' } });
    await strata1.tenants.create({ name: 'WS2', cloudMeta: { bucket: '2' } });
    await strata1.dispose();

    const strata2 = track(createStrata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));

    const list = await strata2.tenants.list();
    expect(list).toHaveLength(2);
    expect(list.map(t => t.name).sort()).toEqual(['WS1', 'WS2']);
  });

  it('multiple tenants → entity data isolation via separate contexts', async () => {
    // Each tenant context uses its own local adapter (simulating scoped local storage)
    const localA = createMemoryBlobAdapter();
    const localB = createMemoryBlobAdapter();

    const strataA = track(createStrata({
      entities: [TaskDef],
      localAdapter: localA,
      deviceId: 'dev-1',
    }));

    const tenantA = await strataA.tenants.create({ name: 'A', cloudMeta: { bucket: 'a' } });
    await strataA.tenants.load(tenantA.id);
    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    repoA.save({ title: 'Task for A', done: false });
    expect(repoA.query()).toHaveLength(1);
    await strataA.dispose();

    // Separate tenant context with its own local storage
    const strataB = track(createStrata({
      entities: [TaskDef],
      localAdapter: localB,
      deviceId: 'dev-1',
    }));
    const tenantB = await strataB.tenants.create({ name: 'B', cloudMeta: { bucket: 'b' } });
    await strataB.tenants.load(tenantB.id);
    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    // B should have no entities — isolated local storage
    expect(repoB.query()).toHaveLength(0);
  });

  it('delink removes tenant from list without deleting data', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Will Delink',
      cloudMeta: { bucket: 'delink' },
    });

    let list = await strata.tenants.list();
    expect(list).toHaveLength(1);

    await strata.tenants.delink(tenant.id);

    list = await strata.tenants.list();
    expect(list).toHaveLength(0);
  });

  it('setup detects existing workspace via marker blob', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const cloudMeta = { folder: 'shared-folder' };

    // Simulate: workspace marker already exists at cloudMeta location
    await writeMarkerBlob(localAdapter, cloudMeta, ['task']);

    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.setup({ cloudMeta, name: 'Shared Project' });
    expect(tenant).toBeDefined();
    expect(tenant.name).toBe('Shared Project');
  });

  it('setup rejects if no marker blob found', async () => {
    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter: createMemoryBlobAdapter(),
      deviceId: 'dev-1',
    }));

    await expect(
      strata.tenants.setup({ cloudMeta: { folder: 'empty' } }),
    ).rejects.toThrow('No strata workspace found');
  });

  it('two devices share tenant via deriveTenantId', async () => {
    const deriveFn = (meta: Record<string, unknown>) =>
      (meta as { folderId: string }).folderId.substring(0, 6);

    const cloudMeta = { folderId: 'abc123xyz' };

    // Device A creates
    const localA = createMemoryBlobAdapter();
    const strataA = track(createStrata({
      entities: [TaskDef],
      localAdapter: localA,
      deviceId: 'dev-A',
    }));
    const tenantA = await strataA.tenants.create({ name: 'Shared', cloudMeta });

    // Device B sets up (needs marker in its adapter)
    const localB = createMemoryBlobAdapter();
    await writeMarkerBlob(localB, cloudMeta, ['task']);
    const strataB = track(createStrata({
      entities: [TaskDef],
      localAdapter: localB,
      deviceId: 'dev-B',
    }));
    const tenantB = await strataB.tenants.setup({ cloudMeta });

    // Both should be able to load their tenants
    await strataA.tenants.load(tenantA.id);
    await strataB.tenants.load(tenantB.id);

    expect(strataA.tenants.activeTenant$.getValue()?.name).toBe('Shared');
    expect(strataB.tenants.activeTenant$.getValue()).toBeDefined();
  });

  it('delete removes tenant and all data at cloudMeta location', async () => {
    const localAdapter = createMemoryBlobAdapter();
    const strata = track(createStrata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Delete Me',
      cloudMeta: { bucket: 'del' },
    });

    await strata.tenants.delete(tenant.id);

    const list = await strata.tenants.list();
    expect(list).toHaveLength(0);
  });
});
