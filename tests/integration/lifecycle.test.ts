import { describe, it, expect, afterEach } from 'vitest';
import {
  Strata,
  defineEntity,
  MemoryBlobAdapter,
  partitioned,
} from '@strata/index';
import type { Repository, SingletonRepository } from '@strata/repo';

type Task = { title: string; done: boolean };
type Settings = { theme: string; fontSize: number };
type Event = { name: string; date: Date; category: string };

const TaskDef = defineEntity<Task>('task');
const SettingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });
const EventDef = defineEntity<Event>('event', {
  keyStrategy: partitioned((e: Event) => e.category),
});

describe('Full lifecycle integration', () => {
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

  it('save → dispose → reload from same local adapter → data persisted', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const meta = { bucket: 'test' };

    // Phase 1: Create, save data, dispose
    const strata1 = track(new Strata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'Workspace', meta });
    await strata1.loadTenant(tenant.id);

    const repo1 = strata1.repo(TaskDef) as Repository<Task>;
    const id1 = repo1.save({ title: 'Buy groceries', done: false });
    const id2 = repo1.save({ title: 'Write tests', done: true });

    await strata1.dispose();

    // Phase 2: Create new instance with same local adapter, verify data
    const strata2 = track(new Strata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);

    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const loaded1 = repo2.get(id1);
    const loaded2 = repo2.get(id2);

    expect(loaded1).toBeDefined();
    expect(loaded1!.title).toBe('Buy groceries');
    expect(loaded1!.done).toBe(false);

    expect(loaded2).toBeDefined();
    expect(loaded2!.title).toBe('Write tests');
    expect(loaded2!.done).toBe(true);
  });

  it('dispose flushes all dirty data before shutting down', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const meta = { bucket: 'test' };

    const strata = track(new Strata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
      options: { flushDebounceMs: 60000 }, // Long debounce to ensure data isn't flushed before dispose
    }));
    const tenant = await strata.tenants.create({ name: 'W', meta });
    await strata.loadTenant(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Urgent', done: false });

    // Dispose forces flush
    await strata.dispose();

    // Reload and verify
    const strata2 = track(new Strata({
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const all = repo2.query();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Urgent');
  });

  it('post-dispose: repo() throws', async () => {
    const strata = track(new Strata({
      entities: [TaskDef],
      localAdapter: new MemoryBlobAdapter(),
      deviceId: 'dev-1',
    }));
    await strata.dispose();

    expect(() => strata.repo(TaskDef)).toThrow('disposed');
  });

  it('post-dispose: sync() rejects', async () => {
    const cloudAdapter = new MemoryBlobAdapter();
    const strata = track(new Strata({
      entities: [TaskDef],
      localAdapter: new MemoryBlobAdapter(),
      cloudAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'T', meta: { b: 1 } });
    await strata.loadTenant(tenant.id);
    await strata.dispose();

    await expect(strata.sync()).rejects.toThrow('disposed');
  });

  it('post-dispose: loadTenant() rejects', async () => {
    const strata = track(new Strata({
      entities: [TaskDef],
      localAdapter: new MemoryBlobAdapter(),
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'T', meta: { b: 1 } });
    await strata.dispose();

    await expect(strata.loadTenant(tenant.id)).rejects.toThrow('disposed');
  });

  it('dispose is idempotent — second call returns same promise', async () => {
    const strata = new Strata({
      entities: [TaskDef],
      localAdapter: new MemoryBlobAdapter(),
      deviceId: 'dev-1',
    });
    const p1 = strata.dispose();
    const p2 = strata.dispose();
    expect(p1).toBe(p2);
    await p1;
  });

  it('multiple entity types survive dispose → reload', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const meta = { bucket: 'test' };

    const strata1 = track(new Strata({
      entities: [TaskDef, SettingsDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta });
    await strata1.loadTenant(tenant.id);

    const taskRepo = strata1.repo(TaskDef) as Repository<Task>;
    const settingsRepo = strata1.repo(SettingsDef) as SingletonRepository<Settings>;

    const taskId = taskRepo.save({ title: 'Task1', done: false });
    settingsRepo.save({ theme: 'dark', fontSize: 14 });

    await strata1.dispose();

    const strata2 = track(new Strata({
      entities: [TaskDef, SettingsDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);

    const taskRepo2 = strata2.repo(TaskDef) as Repository<Task>;
    const settingsRepo2 = strata2.repo(SettingsDef) as SingletonRepository<Settings>;

    expect(taskRepo2.get(taskId)?.title).toBe('Task1');
    expect(settingsRepo2.get()?.theme).toBe('dark');
    expect(settingsRepo2.get()?.fontSize).toBe(14);
  });

  it('partitioned entities survive dispose → reload', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const meta = { bucket: 'test' };

    const strata1 = track(new Strata({
      entities: [EventDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta });
    await strata1.loadTenant(tenant.id);

    const repo1 = strata1.repo(EventDef) as Repository<Event>;
    const id1 = repo1.save({ name: 'Concert', date: new Date('2026-06-15'), category: 'music' });
    const id2 = repo1.save({ name: 'Conference', date: new Date('2026-07-01'), category: 'tech' });

    await strata1.dispose();

    const strata2 = track(new Strata({
      entities: [EventDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);

    const repo2 = strata2.repo(EventDef) as Repository<Event>;
    const loaded1 = repo2.get(id1);
    const loaded2 = repo2.get(id2);

    expect(loaded1?.name).toBe('Concert');
    expect(loaded1?.category).toBe('music');
    expect(loaded2?.name).toBe('Conference');
    expect(loaded2?.category).toBe('tech');
  });
});
