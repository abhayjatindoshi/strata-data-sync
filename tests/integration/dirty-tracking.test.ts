import { describe, it, expect, afterEach } from 'vitest';
import {
  Strata,
  defineEntity,
  MemoryBlobAdapter,
} from '@strata/index';
import type { Repository } from '@strata/repo';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('Dirty tracking integration', () => {
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

  it('isDirty transitions — false → true after save → false after sync', async () => {
    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryBlobAdapter(),
      cloudAdapter: new MemoryBlobAdapter(),
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { b: 1 },
    });
    await strata.tenants.open(tenant.id);

    // Initially not dirty
    expect(strata.isDirty).toBe(false);

    // Save makes it dirty
    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Test', done: false });
    expect(strata.isDirty).toBe(true);

    // Sync clears dirty
    await strata.sync();
    expect(strata.isDirty).toBe(false);
  });

  it('isDirty$ observable — emits true on save, false on sync', async () => {
    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryBlobAdapter(),
      cloudAdapter: new MemoryBlobAdapter(),
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { b: 1 },
    });
    await strata.tenants.open(tenant.id);

    const emissions: boolean[] = [];
    const sub = strata.isDirty$.subscribe(v => emissions.push(v));

    // Save
    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Test', done: false });

    // Sync
    await strata.sync();

    sub.unsubscribe();

    // Should have emitted: false (initial from BehaviorSubject), true (after save), false (after sync)
    expect(emissions).toContain(false);
    expect(emissions).toContain(true);
    expect(emissions[emissions.length - 1]).toBe(false);
  });
});
