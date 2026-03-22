import { describe, it, expect, afterEach } from 'vitest';
import {
  defineEntity,
  dateKeyStrategy,
  createMemoryBlobAdapter,
  createStrata,
  createEntityStore,
  createEntityEventBus,
  scopeStore,
} from '@strata/index';
import { createRepository } from '@strata/repository/repository';
import { storePartition, loadPartition } from '@strata/persistence';
import type { Strata } from '@strata/index';

// ── Entity definitions ──────────────────────────────────────────────
type TodoFields = { title: string; done: boolean };
type NoteFields = { text: string; archived: boolean };

const Todo = defineEntity<TodoFields>('Todo');
const NoteDef = defineEntity<NoteFields>('Note');

// ── Helpers ─────────────────────────────────────────────────────────
function makeAdapter() {
  return createMemoryBlobAdapter();
}

function makeKeyStrategy() {
  return dateKeyStrategy({ period: 'year' });
}

// ── Tests ───────────────────────────────────────────────────────────
describe('Multi-Tenant Handling', () => {
  const instances: Strata[] = [];
  afterEach(() => {
    for (const s of instances) {
      try { s.dispose(); } catch { /* already disposed */ }
    }
    instances.length = 0;
  });

  function track(s: Strata) { instances.push(s); return s; }

  describe('data isolation between tenants', () => {
    it('creates multiple tenants and verifies complete data isolation', async () => {
      const adapter = makeAdapter();
      const strata = track(createStrata({
        entities: [Todo],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'iso-device',
      }));

      const t1 = await strata.tenants.create({ name: 'Tenant Alpha' });
      const t2 = await strata.tenants.create({ name: 'Tenant Beta' });
      const t3 = await strata.tenants.create({ name: 'Tenant Gamma' });

      // Populate tenant 1
      await strata.load(t1.id);
      const repo1 = strata.repo(Todo);
      await repo1.save({ title: 'T1-Todo-A', done: false });
      await repo1.save({ title: 'T1-Todo-B', done: true });

      // Populate tenant 2
      await strata.load(t2.id);
      const repo2 = strata.repo(Todo);
      await repo2.save({ title: 'T2-Todo-X', done: false });

      // Tenant 3 has no data
      await strata.load(t3.id);
      const repo3 = strata.repo(Todo);
      const allT3 = await repo3.getAll();
      expect(allT3).toHaveLength(0);

      // Verify tenant 1 still has its data
      await strata.load(t1.id);
      const repoA = strata.repo(Todo);
      const allT1 = await repoA.getAll();
      expect(allT1).toHaveLength(2);
      expect(allT1.map((t) => t.title).sort()).toEqual(['T1-Todo-A', 'T1-Todo-B']);

      // Verify tenant 2 still has its data
      await strata.load(t2.id);
      const repoB = strata.repo(Todo);
      const allT2 = await repoB.getAll();
      expect(allT2).toHaveLength(1);
      expect(allT2[0].title).toBe('T2-Todo-X');
    });

    it('switching between tenants preserves each tenants state', async () => {
      const adapter = makeAdapter();
      const strata = track(createStrata({
        entities: [Todo, NoteDef],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'switch-device',
      }));

      const tA = await strata.tenants.create({ name: 'A' });
      const tB = await strata.tenants.create({ name: 'B' });

      // Save to tenant A
      await strata.load(tA.id);
      const todoRepoA = strata.repo(Todo);
      const noteRepoA = strata.repo(NoteDef);
      await todoRepoA.save({ title: 'A-Todo', done: false });
      await noteRepoA.save({ text: 'A-Note', archived: false });

      // Switch to B, save
      await strata.load(tB.id);
      const todoRepoB = strata.repo(Todo);
      await todoRepoB.save({ title: 'B-Todo', done: true });

      // Switch back to A — data should still be there
      await strata.load(tA.id);
      const todoRepoA2 = strata.repo(Todo);
      const noteRepoA2 = strata.repo(NoteDef);
      expect(await todoRepoA2.getAll()).toHaveLength(1);
      expect(await noteRepoA2.getAll()).toHaveLength(1);

      // Switch to B — independent data
      await strata.load(tB.id);
      const todoRepoB2 = strata.repo(Todo);
      const noteRepoB2 = strata.repo(NoteDef);
      expect(await todoRepoB2.getAll()).toHaveLength(1);
      expect(await noteRepoB2.getAll()).toHaveLength(0);
    });
  });

  describe('CRUD scoped to tenant', () => {
    it('CRUD operations scoped to a tenant dont leak to other tenants', async () => {
      const adapter = makeAdapter();
      const strata = track(createStrata({
        entities: [Todo],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'crud-device',
      }));

      const tA = await strata.tenants.create({ name: 'A' });
      const tB = await strata.tenants.create({ name: 'B' });

      // Create in A
      await strata.load(tA.id);
      const repoA = strata.repo(Todo);
      const idA = await repoA.save({ title: 'A-only', done: false });

      // B should not see A's entity
      await strata.load(tB.id);
      const repoB = strata.repo(Todo);
      const entityFromB = await repoB.get(idA);
      expect(entityFromB).toBeUndefined();

      // Create in B
      const idB = await repoB.save({ title: 'B-only', done: true });

      // A should not see B's entity
      await strata.load(tA.id);
      const repoA2 = strata.repo(Todo);
      expect(await repoA2.get(idB)).toBeUndefined();
      expect(await repoA2.getAll()).toHaveLength(1);

      // Delete in A should not affect B
      await repoA2.delete(idA);
      expect(await repoA2.getAll()).toHaveLength(0);

      await strata.load(tB.id);
      const repoB2 = strata.repo(Todo);
      expect(await repoB2.getAll()).toHaveLength(1);
    });

    it('update in one tenant does not affect another', async () => {
      const adapter = makeAdapter();
      const strata = track(createStrata({
        entities: [Todo],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'update-device',
      }));

      const tA = await strata.tenants.create({ name: 'A' });
      const tB = await strata.tenants.create({ name: 'B' });

      await strata.load(tA.id);
      const repoA = strata.repo(Todo);
      const id = await repoA.save({ title: 'Original', done: false });

      await strata.load(tB.id);
      const repoB = strata.repo(Todo);
      await repoB.save({ title: 'B-item', done: false });

      // Update in A
      await strata.load(tA.id);
      const repoA2 = strata.repo(Todo);
      await repoA2.save({ id, title: 'Modified', done: true } as TodoFields & { id: string });

      const updatedA = await repoA2.get(id);
      expect(updatedA!.title).toBe('Modified');

      // B should be unaffected
      await strata.load(tB.id);
      const repoB2 = strata.repo(Todo);
      const allB = await repoB2.getAll();
      expect(allB).toHaveLength(1);
      expect(allB[0].title).toBe('B-item');
    });
  });

  describe('persistence isolation', () => {
    it('storing/loading partitions for different tenants is isolated', async () => {
      const adapter = createMemoryBlobAdapter();
      const taskDef = defineEntity('task');

      // Store partition under scoped keys simulating tenant isolation
      await storePartition(adapter, taskDef, 'tenant-A-2025', [
        { id: 'task.tenant-A-2025.a1', title: 'A task' },
      ]);
      await storePartition(adapter, taskDef, 'tenant-B-2025', [
        { id: 'task.tenant-B-2025.b1', title: 'B task' },
      ]);

      const loadedA = await loadPartition(adapter, taskDef, 'tenant-A-2025');
      const loadedB = await loadPartition(adapter, taskDef, 'tenant-B-2025');

      expect(loadedA).toHaveLength(1);
      expect(loadedA[0]!['title']).toBe('A task');
      expect(loadedB).toHaveLength(1);
      expect(loadedB[0]!['title']).toBe('B task');
    });
  });

  describe('observable isolation', () => {
    it('entity and collection observables scoped per-tenant via scopeStore', async () => {
      const bus = createEntityEventBus();

      const wiredStore = createEntityStore({
        onEntitySaved(entityKey, entity, isNew) {
          const dot = entityKey.indexOf('.');
          bus.emit({
            type: isNew ? 'created' : 'updated',
            entityName: entityKey.substring(0, dot),
            partitionKey: entityKey.substring(dot + 1),
            entityId: entity.id,
            entity: entity as Readonly<Record<string, unknown>>,
          });
        },
        onEntityDeleted(entityKey, id) {
          const dot = entityKey.indexOf('.');
          bus.emit({
            type: 'deleted',
            entityName: entityKey.substring(0, dot),
            partitionKey: entityKey.substring(dot + 1),
            entityId: id,
            entity: undefined,
          });
        },
      });

      const s1 = scopeStore(wiredStore, 'tenant-1', bus);
      const s2 = scopeStore(wiredStore, 'tenant-2', bus);

      const repo1 = createRepository({
        entityDef: Todo,
        store: s1,
        eventBus: bus,
        keyStrategy: dateKeyStrategy({ period: 'year' }),
        deviceId: 'dev',
      });
      const repo2 = createRepository({
        entityDef: Todo,
        store: s2,
        eventBus: bus,
        keyStrategy: dateKeyStrategy({ period: 'year' }),
        deviceId: 'dev',
      });

      await repo1.save({ title: 'T1-item', done: false });
      await repo2.save({ title: 'T2-item', done: true });

      const all1 = await repo1.getAll();
      const all2 = await repo2.getAll();

      expect(all1).toHaveLength(1);
      expect(all1[0].title).toBe('T1-item');
      expect(all2).toHaveLength(1);
      expect(all2[0].title).toBe('T2-item');
    });
  });

  describe('tenant deletion does not affect other tenants', () => {
    it('clearing data in one tenant does not affect others', async () => {
      const adapter = makeAdapter();
      const strata = track(createStrata({
        entities: [Todo],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'del-device',
      }));

      const tA = await strata.tenants.create({ name: 'Keeps Data' });
      const tB = await strata.tenants.create({ name: 'Loses Data' });

      // Populate both
      await strata.load(tA.id);
      const repoA = strata.repo(Todo);
      await repoA.save({ title: 'A-safe', done: false });

      await strata.load(tB.id);
      const repoB = strata.repo(Todo);
      const bId = await repoB.save({ title: 'B-delete-me', done: false });

      // Delete everything in B
      await repoB.delete(bId);
      expect(await repoB.getAll()).toHaveLength(0);

      // A should still have its data
      await strata.load(tA.id);
      const repoA2 = strata.repo(Todo);
      expect(await repoA2.getAll()).toHaveLength(1);
      expect((await repoA2.getAll())[0].title).toBe('A-safe');
    });
  });

  describe('full createStrata API with tenants', () => {
    it('end-to-end: create strata → create tenants → CRUD → switch → verify isolation', async () => {
      const adapter = makeAdapter();
      const strata = track(createStrata({
        entities: [Todo, NoteDef],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'full-api-device',
      }));

      // Create tenants
      const t1 = await strata.tenants.create({ name: 'Org One' });
      const t2 = await strata.tenants.create({ name: 'Org Two' });

      const allTenants = await strata.tenants.list();
      expect(allTenants).toHaveLength(2);

      // Populate tenant 1 with Todos and Notes
      await strata.load(t1.id);
      const todoRepo1 = strata.repo(Todo);
      const noteRepo1 = strata.repo(NoteDef);

      const todo1Id = await todoRepo1.save({ title: 'Org1-Todo', done: false });
      await noteRepo1.save({ text: 'Org1-Note', archived: false });

      // Populate tenant 2 with only Todos
      await strata.load(t2.id);
      const todoRepo2 = strata.repo(Todo);
      await todoRepo2.save({ title: 'Org2-Todo', done: true });

      // Verify tenant 1
      await strata.load(t1.id);
      const verifyTodoRepo1 = strata.repo(Todo);
      const verifyNoteRepo1 = strata.repo(NoteDef);
      expect(await verifyTodoRepo1.getAll()).toHaveLength(1);
      expect(await verifyNoteRepo1.getAll()).toHaveLength(1);

      // Verify tenant 2
      await strata.load(t2.id);
      const verifyTodoRepo2 = strata.repo(Todo);
      const verifyNoteRepo2 = strata.repo(NoteDef);
      expect(await verifyTodoRepo2.getAll()).toHaveLength(1);
      expect(await verifyNoteRepo2.getAll()).toHaveLength(0);

      // Update in tenant 1
      await strata.load(t1.id);
      const updateRepo = strata.repo(Todo);
      await updateRepo.save({ id: todo1Id, title: 'Updated', done: true } as TodoFields & { id: string });
      const updated = await updateRepo.get(todo1Id);
      expect(updated!.title).toBe('Updated');
      expect(updated!.version).toBe(2);

      // Sync should not throw
      expect(() => strata.sync()).not.toThrow();
    });
  });
});
