import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import {
  Strata,
  defineEntity,
  MemoryBlobAdapter,
  serialize,
  mergePartition,
} from '@strata/index';
import type { SyncEvent, BlobAdapter } from '@strata/index';
import type { Repository } from '@strata/repo';

type Task = { title: string; done: boolean; priority: number };

const TaskDef = defineEntity<Task>('task');

function createFailingAdapter(): BlobAdapter {
  return {
    async read() { throw new Error('Cloud unreachable'); },
    async write() { throw new Error('Cloud unreachable'); },
    async delete() { throw new Error('Cloud unreachable'); },
    async list() { throw new Error('Cloud unreachable'); },
  };
}

describe('Sync advanced integration', () => {
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

  it('cloud unreachable fallback — hydrate falls back to local-only', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const failingCloud = createFailingAdapter();
    const events: SyncEvent[] = [];

    const strata = track(new Strata({
      entities: [TaskDef],
      localAdapter,
      cloudAdapter: failingCloud,
      deviceId: 'dev-1',
    }));

    strata.onSyncEvent(e => events.push(e));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { bucket: 'test' },
    });

    // Load tenant — cloud hydrate will fail, should fall back to local
    await strata.loadTenant(tenant.id);

    // Should have emitted cloud-unreachable
    expect(events.some(e => e.type === 'cloud-unreachable')).toBe(true);

    // Should still work in local-only mode
    const repo = strata.repo(TaskDef) as Repository<Task>;
    const id = repo.save({ title: 'Local', done: false, priority: 1 });
    expect(repo.get(id)?.title).toBe('Local');
  });

  it('sync lock dedup — concurrent sync() calls both resolve without error', async () => {
    const sharedCloud = new MemoryBlobAdapter();
    const localAdapter = new MemoryBlobAdapter();

    const strata = track(new Strata({
      entities: [TaskDef],
      localAdapter,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { folder: 'shared' },
    });
    await strata.loadTenant(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Item', done: false, priority: 1 });

    // Call sync() twice concurrently — sync lock should dedup
    const [r1, r2] = await Promise.all([
      strata.sync(),
      strata.sync(),
    ]);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();

    // Data should be consistent
    const data = repo.query();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Item');
  });

  it('HLC nodeId tiebreaker — deterministic winner when timestamp and counter are equal', () => {
    const hlcA = { timestamp: 1000, counter: 5, nodeId: 'device-A' };
    const hlcB = { timestamp: 1000, counter: 5, nodeId: 'device-B' };

    const entityA = {
      id: 'task._.abc123',
      title: 'From A',
      done: false,
      priority: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 1,
      device: 'device-A',
      hlc: hlcA,
    };

    const entityB = {
      id: 'task._.abc123',
      title: 'From B',
      done: true,
      priority: 2,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 1,
      device: 'device-B',
      hlc: hlcB,
    };

    const localBlob = ({
      task: { 'task._.abc123': entityA },
      deleted: { task: {} },
    });
    const cloudBlob = ({
      task: { 'task._.abc123': entityB },
      deleted: { task: {} },
    });

    const result = mergePartition(localBlob, cloudBlob, 'task');

    // device-B > device-A lexicographically, so B wins
    const merged = result.entities['task._.abc123'] as typeof entityB;
    expect(merged.title).toBe('From B');
    expect(merged.device).toBe('device-B');
  });

  it('sync + reactive end-to-end — A saves → syncs → B hydrates → B observe emits', async () => {
    const sharedCloud = new MemoryBlobAdapter();

    // Device A
    const localA = new MemoryBlobAdapter();
    const strataA = track(new Strata({
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await strataA.loadTenant(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false, priority: 1 });
    await strataA.sync();

    // Device B — hydrate from cloud via tenant load
    const localB = new MemoryBlobAdapter();
    const strataB = track(new Strata({
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
    await strataB.loadTenant(tenant.id);

    // B's observe should emit the entity from A
    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    const entity = await firstValueFrom(repoB.observe(id));

    expect(entity).toBeDefined();
    expect(entity!.title).toBe('From A');
    expect(entity!.done).toBe(false);
    expect(entity!.priority).toBe(1);
  });
});
