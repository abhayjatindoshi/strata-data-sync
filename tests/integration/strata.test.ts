import { describe, it, expect, afterEach } from 'vitest';
import {
  defineEntity,
  dateKeyStrategy,
  createMemoryBlobAdapter,
  createStrata,
  serialize,
} from '@strata/index';
import type { Strata } from '@strata/index';

// ── Entity definitions ──────────────────────────────────────────────
type NoteFields = { title: string; body: string };
type TaskFields = { description: string; done: boolean; priority: number };

const Note = defineEntity<NoteFields>('Note');
const Task = defineEntity<TaskFields>('Task');

// ── Helpers ─────────────────────────────────────────────────────────
function makeAdapter() {
  return createMemoryBlobAdapter();
}

function makeKeyStrategy() {
  return dateKeyStrategy({ period: 'year' });
}

async function seedTenant(
  adapter: ReturnType<typeof createMemoryBlobAdapter>,
  tenantId: string,
  name = 'Test Tenant',
) {
  const existing = await adapter.read('__tenants');
  let blob: Record<string, Record<string, Record<string, unknown>>> = { __tenants: {} };
  if (existing) {
    blob = JSON.parse(new TextDecoder().decode(existing));
  }
  blob.__tenants![tenantId] = {
    id: tenantId,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    device: 'test-device',
  };
  const json = serialize(blob);
  await adapter.write('__tenants', new TextEncoder().encode(json));
}

function createConfiguredStrata(adapterOverride?: ReturnType<typeof createMemoryBlobAdapter>) {
  const adapter = adapterOverride ?? makeAdapter();
  return {
    strata: createStrata({
      entities: [Note, Task],
      localAdapter: adapter,
      keyStrategy: makeKeyStrategy(),
      deviceId: 'integration-device',
    }),
    adapter,
  };
}

// ── Tests ───────────────────────────────────────────────────────────
describe('createStrata', () => {
  const instances: Strata[] = [];
  afterEach(() => {
    for (const s of instances) {
      try { s.dispose(); } catch { /* already disposed */ }
    }
    instances.length = 0;
  });

  function track(s: Strata) { instances.push(s); return s; }

  // ── 1. Instance creation with config ──────────────────────────────
  describe('instance creation with config', () => {
    it('creates a Strata instance with required config properties', () => {
      const { strata } = createConfiguredStrata();
      track(strata);

      expect(strata).toBeDefined();
      expect(strata.repo).toBeTypeOf('function');
      expect(strata.load).toBeTypeOf('function');
      expect(strata.sync).toBeTypeOf('function');
      expect(strata.dispose).toBeTypeOf('function');
      expect(strata.tenants).toBeDefined();
    });

    it('rejects duplicate entity names', () => {
      const DupNote = defineEntity<{ x: number }>('Note');
      expect(() =>
        createStrata({
          entities: [Note, DupNote],
          localAdapter: makeAdapter(),
          keyStrategy: makeKeyStrategy(),
          deviceId: 'dup-device',
        }),
      ).toThrow('Duplicate entity name');
    });

    it('accepts optional cloudAdapter in config', () => {
      const strata = track(
        createStrata({
          entities: [Note],
          localAdapter: makeAdapter(),
          cloudAdapter: makeAdapter(),
          keyStrategy: makeKeyStrategy(),
          deviceId: 'cloud-device',
        }),
      );
      expect(strata).toBeDefined();
    });
  });

  // ── 2. Typed repositories via strata.repo() ──────────────────────
  describe('typed repositories via strata.repo()', () => {
    it('returns a repository with full CRUD + observe API', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-repo');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-repo');

      const noteRepo = strata.repo(Note);
      expect(noteRepo.get).toBeTypeOf('function');
      expect(noteRepo.getAll).toBeTypeOf('function');
      expect(noteRepo.save).toBeTypeOf('function');
      expect(noteRepo.delete).toBeTypeOf('function');
      expect(noteRepo.observe).toBeTypeOf('function');
      expect(noteRepo.observeAll).toBeTypeOf('function');
    });

    it('caches the same repository instance on repeated calls', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-cache');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-cache');

      const repo1 = strata.repo(Note);
      const repo2 = strata.repo(Note);
      expect(repo1).toBe(repo2);
    });

    it('returns different repositories for different entity defs', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-diff');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-diff');

      const noteRepo = strata.repo(Note);
      const taskRepo = strata.repo(Task);
      expect(noteRepo).not.toBe(taskRepo);
    });

    it('throws if entity def is not registered', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-unreg');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-unreg');

      const Unknown = defineEntity<{ x: number }>('Unknown');
      expect(() => strata.repo(Unknown)).toThrow('not registered');
    });

    it('throws when no tenant has been loaded', () => {
      const { strata } = createConfiguredStrata();
      track(strata);
      expect(() => strata.repo(Note)).toThrow('No tenant loaded');
    });
  });

  // ── 3. CRUD through repositories ─────────────────────────────────
  describe('CRUD through repositories', () => {
    it('saves and retrieves an entity by id', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-crud');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-crud');

      const repo = strata.repo(Note);
      const id = await repo.save({ title: 'Hello', body: 'World' });
      expect(id).toBeTypeOf('string');

      const note = await repo.get(id);
      expect(note).toBeDefined();
      expect(note!.title).toBe('Hello');
      expect(note!.body).toBe('World');
    });

    it('updates an existing entity preserving createdAt', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-update');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-update');

      const repo = strata.repo(Note);
      const id = await repo.save({ title: 'Draft', body: 'v1' });
      const original = await repo.get(id);

      await repo.save({ id, title: 'Final', body: 'v2' } as NoteFields & { id: string });
      const updated = await repo.get(id);

      expect(updated!.title).toBe('Final');
      expect(updated!.body).toBe('v2');
      expect(updated!.version).toBe(2);
      expect(updated!.createdAt).toEqual(original!.createdAt);
    });

    it('deletes an entity', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-delete');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-delete');

      const repo = strata.repo(Note);
      const id = await repo.save({ title: 'Temp', body: 'gone' });
      const deleted = await repo.delete(id);
      expect(deleted).toBe(true);

      const gone = await repo.get(id);
      expect(gone).toBeUndefined();
    });

    it('getAll returns all saved entities', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-getall');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-getall');

      const repo = strata.repo(Task);
      await repo.save({ description: 'Task A', done: false, priority: 1 });
      await repo.save({ description: 'Task B', done: true, priority: 2 });
      await repo.save({ description: 'Task C', done: false, priority: 3 });

      const all = await repo.getAll();
      expect(all).toHaveLength(3);
    });

    it('getAll supports where filter', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-filter');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-filter');

      const repo = strata.repo(Task);
      await repo.save({ description: 'Done task', done: true, priority: 1 });
      await repo.save({ description: 'Open task', done: false, priority: 2 });

      const doneTasks = await repo.getAll({ where: { done: true } });
      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].description).toBe('Done task');
    });

    it('getAll supports orderBy', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-order');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-order');

      const repo = strata.repo(Task);
      await repo.save({ description: 'Low', done: false, priority: 3 });
      await repo.save({ description: 'High', done: false, priority: 1 });
      await repo.save({ description: 'Med', done: false, priority: 2 });

      const sorted = await repo.getAll({
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(sorted[0].priority).toBe(1);
      expect(sorted[1].priority).toBe(2);
      expect(sorted[2].priority).toBe(3);
    });
  });

  // ── 4. Tenant switching via strata.load() ─────────────────────────
  describe('tenant switching via strata.load()', () => {
    it('loads a tenant and scopes data', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-A', 'Tenant A');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-A');

      const repo = strata.repo(Note);
      await repo.save({ title: 'A note', body: 'belongs to A' });
      const all = await repo.getAll();
      expect(all).toHaveLength(1);
    });

    it('isolates data between tenants', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'iso-A', 'Iso A');
      await seedTenant(adapter, 'iso-B', 'Iso B');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);

      await strata.load('iso-A');
      const repoA = strata.repo(Note);
      await repoA.save({ title: 'A only', body: 'secret' });

      await strata.load('iso-B');
      const repoB = strata.repo(Note);
      const allB = await repoB.getAll();
      expect(allB).toHaveLength(0);
    });

    it('clears cached repos on tenant switch', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'sw-1', 'SW1');
      await seedTenant(adapter, 'sw-2', 'SW2');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);

      await strata.load('sw-1');
      const repo1 = strata.repo(Note);

      await strata.load('sw-2');
      const repo2 = strata.repo(Note);

      expect(repo1).not.toBe(repo2);
    });

    it('throws when loading a non-existent tenant', async () => {
      const { strata } = createConfiguredStrata();
      track(strata);
      await expect(strata.load('ghost')).rejects.toThrow('Tenant not found');
    });
  });

  // ── 5. Sync triggering via strata.sync() ──────────────────────────
  describe('sync triggering via strata.sync()', () => {
    it('sync() does not throw on a loaded instance', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-sync');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-sync');

      expect(() => strata.sync()).not.toThrow();
    });

    it('sync() can be called after CRUD operations', async () => {
      const adapter = makeAdapter();
      await seedTenant(adapter, 'tenant-sync2');
      const { strata } = createConfiguredStrata(adapter);
      track(strata);
      await strata.load('tenant-sync2');

      const repo = strata.repo(Note);
      await repo.save({ title: 'Sync me', body: 'please' });

      expect(() => strata.sync()).not.toThrow();
    });

    it('sync() throws after dispose', () => {
      const { strata } = createConfiguredStrata();
      strata.dispose();
      expect(() => strata.sync()).toThrow('disposed');
    });
  });

  // ── 6. Dispose and cleanup ────────────────────────────────────────
  describe('dispose and cleanup', () => {
    it('marks instance as disposed — repo/sync/load all throw', async () => {
      const { strata } = createConfiguredStrata();
      strata.dispose();

      expect(() => strata.repo(Note)).toThrow('disposed');
      expect(() => strata.sync()).toThrow('disposed');
      await expect(strata.load('any')).rejects.toThrow('disposed');
    });

    it('can be called multiple times without error', () => {
      const { strata } = createConfiguredStrata();
      strata.dispose();
      expect(() => strata.dispose()).not.toThrow();
    });

    it('independent instances do not interfere on dispose', async () => {
      const adapter1 = makeAdapter();
      const adapter2 = makeAdapter();
      await seedTenant(adapter1, 't1');
      await seedTenant(adapter2, 't2');

      const s1 = track(createStrata({
        entities: [Note],
        localAdapter: adapter1,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'dev-1',
      }));
      const s2 = track(createStrata({
        entities: [Note],
        localAdapter: adapter2,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'dev-2',
      }));

      await s1.load('t1');
      await s2.load('t2');

      s1.dispose();

      const repo2 = s2.repo(Note);
      const id = await repo2.save({ title: 'Still alive', body: 'yes' });
      const note = await repo2.get(id);
      expect(note!.title).toBe('Still alive');
    });
  });

  // ── 7. End-to-end workflow ────────────────────────────────────────
  describe('end-to-end workflow', () => {
    it('full lifecycle: define entities → create strata → create tenant → load → save → sync → verify → dispose', async () => {
      const Project = defineEntity<{ name: string; active: boolean }>('Project');
      const Member = defineEntity<{ email: string; role: string }>('Member');

      const adapter = makeAdapter();
      const strata = track(
        createStrata({
          entities: [Project, Member],
          localAdapter: adapter,
          keyStrategy: makeKeyStrategy(),
          deviceId: 'e2e-device',
        }),
      );

      const tenant = await strata.tenants.create({ name: 'Acme Corp' });
      expect(tenant.id).toBeTypeOf('string');
      expect(tenant.name).toBe('Acme Corp');

      await strata.load(tenant.id);

      const projectRepo = strata.repo(Project);
      const memberRepo = strata.repo(Member);

      const projId = await projectRepo.save({ name: 'Alpha', active: true });
      const memId1 = await memberRepo.save({ email: 'alice@acme.com', role: 'admin' });
      await memberRepo.save({ email: 'bob@acme.com', role: 'member' });

      const proj = await projectRepo.get(projId);
      expect(proj).toBeDefined();
      expect(proj!.name).toBe('Alpha');
      expect(proj!.active).toBe(true);
      expect(proj!.version).toBe(1);
      expect(proj!.device).toBe('e2e-device');

      const members = await memberRepo.getAll();
      expect(members).toHaveLength(2);
      const emails = members.map((m) => m.email).sort();
      expect(emails).toEqual(['alice@acme.com', 'bob@acme.com']);

      await projectRepo.save({ id: projId, name: 'Alpha v2', active: false } as { name: string; active: boolean } & { id: string });
      const updated = await projectRepo.get(projId);
      expect(updated!.name).toBe('Alpha v2');
      expect(updated!.active).toBe(false);
      expect(updated!.version).toBe(2);

      expect(() => strata.sync()).not.toThrow();

      const deleted = await memberRepo.delete(memId1);
      expect(deleted).toBe(true);
      const remainingMembers = await memberRepo.getAll();
      expect(remainingMembers).toHaveLength(1);
      expect(remainingMembers[0].email).toBe('bob@acme.com');

      strata.dispose();
      expect(() => strata.repo(Project)).toThrow('disposed');
    });

    it('multi-tenant end-to-end: two tenants with isolated data', async () => {
      const Widget = defineEntity<{ label: string; count: number }>('Widget');
      const adapter = makeAdapter();

      const strata = track(
        createStrata({
          entities: [Widget],
          localAdapter: adapter,
          keyStrategy: makeKeyStrategy(),
          deviceId: 'multi-tenant-device',
        }),
      );

      const t1 = await strata.tenants.create({ name: 'Org One' });
      const t2 = await strata.tenants.create({ name: 'Org Two' });

      await strata.load(t1.id);
      const repo1 = strata.repo(Widget);
      await repo1.save({ label: 'Gear', count: 10 });
      await repo1.save({ label: 'Bolt', count: 50 });
      const allT1 = await repo1.getAll();
      expect(allT1).toHaveLength(2);

      await strata.load(t2.id);
      const repo2 = strata.repo(Widget);
      const allT2 = await repo2.getAll();
      expect(allT2).toHaveLength(0);

      await repo2.save({ label: 'Spring', count: 100 });
      const allT2After = await repo2.getAll();
      expect(allT2After).toHaveLength(1);
      expect(allT2After[0].label).toBe('Spring');

      strata.sync();
    });

    it('tenant manager list/create works through strata.tenants', async () => {
      const adapter = makeAdapter();
      const strata = track(
        createStrata({
          entities: [Note],
          localAdapter: adapter,
          keyStrategy: makeKeyStrategy(),
          deviceId: 'tm-device',
        }),
      );

      const before = await strata.tenants.list();
      expect(before).toHaveLength(0);

      await strata.tenants.create({ name: 'First' });
      await strata.tenants.create({ name: 'Second' });

      const after = await strata.tenants.list();
      expect(after).toHaveLength(2);
      const names = after.map((t) => t.name).sort();
      expect(names).toEqual(['First', 'Second']);
    });
  });
});
