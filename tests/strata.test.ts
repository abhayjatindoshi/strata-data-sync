import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createStrata,
  validateEntityDefinitions,
  defineEntity,
  createMemoryBlobAdapter,
  serialize,
} from '@strata/index';
import type { Strata, SyncEvent } from '@strata/index';
import type { Repository, SingletonRepository } from '@strata/repo';

type Task = { title: string; done: boolean };
type Settings = { theme: string };

function makeAdapter() {
  return createMemoryBlobAdapter();
}

function makeStrata(overrides?: {
  cloudAdapter?: ReturnType<typeof createMemoryBlobAdapter>;
  entities?: ReturnType<typeof defineEntity>[];
}): { strata: Strata; localAdapter: ReturnType<typeof createMemoryBlobAdapter> } {
  const taskDef = defineEntity<Task>('task');
  const localAdapter = makeAdapter();
  const strata = createStrata({
    entities: overrides?.entities ?? [taskDef],
    localAdapter,
    cloudAdapter: overrides?.cloudAdapter,
    deviceId: 'test-device',
  });
  return { strata, localAdapter };
}

describe('validateEntityDefinitions', () => {
  it('rejects empty entity list', () => {
    expect(() => validateEntityDefinitions([])).toThrow(
      'At least one entity definition is required',
    );
  });

  it('rejects entity definition with empty name', () => {
    const noName = defineEntity<Task>('' as string);
    expect(() => validateEntityDefinitions([noName])).toThrow(
      'Entity definition must have a name',
    );
  });

  it('rejects duplicate entity names', () => {
    const a = defineEntity<Task>('task');
    const b = defineEntity<Task>('task');
    expect(() => validateEntityDefinitions([a, b])).toThrow(
      'Duplicate entity name: task',
    );
  });

  it('accepts valid entity definitions', () => {
    const a = defineEntity<Task>('task');
    const b = defineEntity<Settings>('settings');
    expect(() => validateEntityDefinitions([a, b])).not.toThrow();
  });
});

describe('createStrata', () => {
  let strata: Strata;

  afterEach(async () => {
    if (strata) {
      await strata.dispose();
    }
  });

  it('creates strata instance with all public API methods', () => {
    ({ strata } = makeStrata());
    expect(strata.tenants).toBeDefined();
    expect(strata.repo).toBeTypeOf('function');
    expect(strata.sync).toBeTypeOf('function');
    expect(strata.dispose).toBeTypeOf('function');
    expect(strata.isDirty).toBe(false);
    expect(strata.isDirty$).toBeDefined();
    expect(strata.onSyncEvent).toBeTypeOf('function');
    expect(strata.offSyncEvent).toBeTypeOf('function');
  });

  describe('repo()', () => {
    it('returns repository for known entity definition', () => {
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(taskDef);
      expect(repo).toBeDefined();
    });

    it('throws for unknown entity definition', () => {
      const taskDef = defineEntity<Task>('task');
      const unknownDef = defineEntity<Settings>('settings');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      expect(() => strata.repo(unknownDef)).toThrow('Unknown entity definition');
    });

    it('returns Repository for non-singleton entities', () => {
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(taskDef) as Repository<Task>;
      expect(repo.save).toBeTypeOf('function');
      expect(repo.query).toBeTypeOf('function');
      expect(repo.get).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
    });

    it('returns SingletonRepository for singleton entities', () => {
      const settingsDef = defineEntity<Settings>('settings', {
        keyStrategy: 'singleton',
      });
      strata = createStrata({
        entities: [settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
      expect(repo.save).toBeTypeOf('function');
      expect(repo.get).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
      expect(repo.observe).toBeTypeOf('function');
    });

    it('allows CRUD operations through repo', () => {
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(taskDef) as Repository<Task>;
      const id = repo.save({ title: 'Test', done: false });
      expect(id).toBeTruthy();

      const entity = repo.get(id);
      expect(entity?.title).toBe('Test');
      expect(entity?.done).toBe(false);

      const results = repo.query();
      expect(results).toHaveLength(1);

      const deleted = repo.delete(id);
      expect(deleted).toBe(true);
      expect(repo.query()).toHaveLength(0);
    });

    it('supports multiple entity types', () => {
      const taskDef = defineEntity<Task>('task');
      const settingsDef = defineEntity<Settings>('settings', {
        keyStrategy: 'singleton',
      });
      strata = createStrata({
        entities: [taskDef, settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });

      const taskRepo = strata.repo(taskDef) as Repository<Task>;
      const settingsRepo = strata.repo(settingsDef) as SingletonRepository<Settings>;

      taskRepo.save({ title: 'Task1', done: false });
      settingsRepo.save({ theme: 'dark' });

      expect(taskRepo.query()).toHaveLength(1);
      expect(settingsRepo.get()?.theme).toBe('dark');
    });
  });

  describe('tenants', () => {
    it('exposes tenant manager', () => {
      ({ strata } = makeStrata());
      expect(strata.tenants.list).toBeTypeOf('function');
      expect(strata.tenants.create).toBeTypeOf('function');
      expect(strata.tenants.load).toBeTypeOf('function');
      expect(strata.tenants.setup).toBeTypeOf('function');
      expect(strata.tenants.delink).toBeTypeOf('function');
      expect(strata.tenants.delete).toBeTypeOf('function');
      expect(strata.tenants.activeTenant$).toBeDefined();
    });

    it('creates and loads a tenant', async () => {
      ({ strata } = makeStrata());
      const tenant = await strata.tenants.create({
        name: 'Test Workspace',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);
      expect(strata.tenants.activeTenant$.getValue()?.id).toBe(tenant.id);
    });

    it('stops previous sync scheduler when loading a new tenant', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const t1 = await strata.tenants.create({
        name: 'Tenant 1',
        meta: { bucket: 't1' },
      });
      const t2 = await strata.tenants.create({
        name: 'Tenant 2',
        meta: { bucket: 't2' },
      });

      await strata.tenants.load(t1.id);
      // Load a second tenant — should stop the first scheduler
      await strata.tenants.load(t2.id);

      expect(strata.tenants.activeTenant$.getValue()?.id).toBe(t2.id);
    });

    it('hydrates from local on tenant load without cloud adapter', async () => {
      const localAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);
      expect(strata.tenants.activeTenant$.getValue()?.name).toBe('Test');
    });

    it('emits cloud-unreachable when cloud adapter fails during hydrate', async () => {
      const localAdapter = makeAdapter();
      const failingCloudAdapter = makeAdapter();
      // Sabotage the cloud adapter to simulate unreachable
      failingCloudAdapter.read = () => {
        throw new Error('Network error');
      };

      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter,
        cloudAdapter: failingCloudAdapter,
        deviceId: 'dev',
      });

      const events: SyncEvent[] = [];
      strata.onSyncEvent(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);

      expect(events.some(e => e.type === 'cloud-unreachable')).toBe(true);
    });
  });

  describe('sync()', () => {
    it('rejects when no tenant loaded', async () => {
      const cloudAdapter = makeAdapter();
      ({ strata } = makeStrata({ cloudAdapter }));
      await expect(strata.sync()).rejects.toThrow('No tenant loaded');
    });

    it('rejects when no cloud adapter configured', async () => {
      ({ strata } = makeStrata());
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);
      await expect(strata.sync()).rejects.toThrow('No cloud adapter configured');
    });

    it('succeeds with cloud adapter and loaded tenant', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);

      const result = await strata.sync();
      expect(result).toBeDefined();
      expect(result.entitiesUpdated).toBe(0);
    });

    it('emits sync-started and sync-completed events', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      strata.onSyncEvent(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);
      await strata.sync();

      const types = events.map(e => e.type);
      expect(types).toContain('sync-started');
      expect(types).toContain('sync-completed');
    });

    it('emits sync-failed event on sync error', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      strata.onSyncEvent(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);

      // Sabotage cloud adapter to cause sync failure
      cloudAdapter.read = () => {
        throw new Error('Sync failure');
      };

      await expect(strata.sync()).rejects.toThrow('Sync failure');
      expect(events.some(e => e.type === 'sync-failed')).toBe(true);
    });
  });

  describe('isDirty', () => {
    it('starts clean', () => {
      ({ strata } = makeStrata());
      expect(strata.isDirty).toBe(false);
    });

    it('becomes dirty after save', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);

      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(strata.isDirty).toBe(true);
    });

    it('clears after sync', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);

      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(strata.isDirty).toBe(true);

      await strata.sync();
      expect(strata.isDirty).toBe(false);
    });

    it('exposes isDirty$ observable', () => {
      ({ strata } = makeStrata());
      const values: boolean[] = [];
      strata.isDirty$.subscribe(v => values.push(v));
      expect(values[0]).toBe(false);
    });
  });

  describe('sync events', () => {
    it('onSyncEvent/offSyncEvent manages listeners', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      const listener = (e: SyncEvent) => events.push(e);

      strata.onSyncEvent(listener);
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);
      await strata.sync();
      expect(events.length).toBeGreaterThan(0);

      const countBefore = events.length;
      strata.offSyncEvent(listener);
      await strata.sync();
      expect(events.length).toBe(countBefore);
    });
  });

  describe('dispose()', () => {
    it('returns a promise', async () => {
      ({ strata } = makeStrata());
      const result = strata.dispose();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('is idempotent — returns same promise', async () => {
      ({ strata } = makeStrata());
      const p1 = strata.dispose();
      const p2 = strata.dispose();
      expect(p1).toBe(p2);
      await p1;
    });

    it('repo() throws after dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      await strata.dispose();
      expect(() => strata.repo(taskDef)).toThrow('Strata instance is disposed');
    });

    it('sync() rejects after dispose', async () => {
      const cloudAdapter = makeAdapter();
      ({ strata } = makeStrata({ cloudAdapter }));
      await strata.dispose();
      await expect(strata.sync()).rejects.toThrow('Strata instance is disposed');
    });

    it('tenants.load() rejects after dispose', async () => {
      ({ strata } = makeStrata());
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.dispose();
      await expect(strata.tenants.load(tenant.id)).rejects.toThrow(
        'Strata instance is disposed',
      );
    });

    it('flushes dirty data on dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      const localAdapter = makeAdapter();
      strata = createStrata({
        entities: [taskDef],
        localAdapter,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.load(tenant.id);

      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Flush Test', done: false });

      await strata.dispose();

      // After dispose, the data should be flushed to local adapter
      const keys = await localAdapter.list(tenant, 'task.');
      expect(keys.length).toBeGreaterThan(0);
    });

    it('disposes all repositories', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = createStrata({
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });

      const repo = strata.repo(taskDef) as Repository<Task>;
      await strata.dispose();

      expect(() => repo.save({ title: 'After', done: false })).toThrow(
        'Repository is disposed',
      );
    });
  });
});
