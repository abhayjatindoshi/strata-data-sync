import { describe, it, expect, afterEach } from 'vitest';
import {
  defineEntity,
  dateKeyStrategy,
  createMemoryBlobAdapter,
  createEntityStore,
  createEntityEventBus,
  createDirtyTracker,
  createSyncScheduler,
  storePartition,
  loadPartition,
  createStrata,
} from '@strata/index';
import { createRepository } from '@strata/repository/repository';
import type { Strata } from '@strata/index';

// ── Entity definitions ──────────────────────────────────────────────
type TodoFields = { title: string; done: boolean };
type NoteFields = { text: string; archived: boolean };

const Todo = defineEntity<TodoFields>('Todo');
const NoteDef = defineEntity<NoteFields>('Note');

function makeKeyStrategy() {
  return dateKeyStrategy({ period: 'year' });
}

function makeWiredStore() {
  const bus = createEntityEventBus();
  const store = createEntityStore({
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
  return { store, bus };
}

// ── Tests ───────────────────────────────────────────────────────────
describe('Parallel & Concurrent Operations', () => {
  const instances: Strata[] = [];
  afterEach(() => {
    for (const s of instances) {
      try { s.dispose(); } catch { /* already disposed */ }
    }
    instances.length = 0;
  });
  function track(s: Strata) { instances.push(s); return s; }

  describe('concurrent entity saves to the same partition', () => {
    it('handles multiple simultaneous saves to the same partition', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'par-device',
      });

      // Fire 10 concurrent saves
      const promises = Array.from({ length: 10 }, (_, i) =>
        repo.save({ title: `Todo-${i}`, done: i % 2 === 0 }),
      );

      const ids = await Promise.all(promises);

      expect(ids).toHaveLength(10);
      expect(new Set(ids).size).toBe(10); // all IDs unique

      const all = await repo.getAll();
      expect(all).toHaveLength(10);
    });

    it('concurrent saves produce valid entities with incrementing versions', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'ver-device',
      });

      const ids = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          repo.save({ title: `Item-${i}`, done: false }),
        ),
      );

      for (const id of ids) {
        const entity = await repo.get(id);
        expect(entity).toBeDefined();
        expect(entity!.version).toBe(1);
        expect(entity!.id).toBe(id);
      }
    });
  });

  describe('concurrent saves to different partitions', () => {
    it('handles parallel saves across multiple entity types', async () => {
      const { store, bus } = makeWiredStore();
      const todoRepo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'multi-par',
      });
      const noteRepo = createRepository({
        entityDef: NoteDef,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'multi-par',
      });

      const [todoIds, noteIds] = await Promise.all([
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            todoRepo.save({ title: `Todo-${i}`, done: false }),
          ),
        ),
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            noteRepo.save({ text: `Note-${i}`, archived: false }),
          ),
        ),
      ]);

      expect(todoIds).toHaveLength(5);
      expect(noteIds).toHaveLength(5);

      const allTodos = await todoRepo.getAll();
      const allNotes = await noteRepo.getAll();
      expect(allTodos).toHaveLength(5);
      expect(allNotes).toHaveLength(5);
    });
  });

  describe('concurrent reads and writes', () => {
    it('reads return consistent data while concurrent writes happen', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'rw-device',
      });

      // Seed some data
      const seedIds = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          repo.save({ title: `Seed-${i}`, done: false }),
        ),
      );

      // Concurrent reads and writes
      const [moreIds, readResults] = await Promise.all([
        Promise.all(
          Array.from({ length: 3 }, (_, i) =>
            repo.save({ title: `New-${i}`, done: true }),
          ),
        ),
        Promise.all(seedIds.map((id) => repo.get(id))),
      ]);

      // All seeded entities should still be readable
      for (const entity of readResults) {
        expect(entity).toBeDefined();
        expect(entity!.title).toMatch(/^Seed-/);
      }

      // All new entities should be saved
      expect(moreIds).toHaveLength(3);
      const all = await repo.getAll();
      expect(all.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('parallel blob adapter operations', () => {
    it('concurrent read/write/list on memory blob adapter', async () => {
      const adapter = createMemoryBlobAdapter();
      const enc = new TextEncoder();

      // Concurrent writes
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          adapter.write(`key-${i}`, enc.encode(`data-${i}`)),
        ),
      );

      // Concurrent reads
      const readResults = await Promise.all(
        Array.from({ length: 10 }, (_, i) => adapter.read(`key-${i}`)),
      );

      for (let i = 0; i < 10; i++) {
        expect(readResults[i]).not.toBeNull();
        expect(new TextDecoder().decode(readResults[i]!)).toBe(`data-${i}`);
      }

      // Concurrent list
      const [list1, list2] = await Promise.all([
        adapter.list('key-'),
        adapter.list('key-'),
      ]);
      expect(list1).toHaveLength(10);
      expect(list2).toHaveLength(10);
    });

    it('concurrent storePartition and loadPartition', async () => {
      const adapter = createMemoryBlobAdapter();
      const taskDef = defineEntity('task');

      // Concurrent stores to different partitions
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          storePartition(adapter, taskDef, `part-${i}`, [
            { id: `task.part-${i}.item-0`, name: `P${i}-Item` },
          ]),
        ),
      );

      // Concurrent loads
      const loaded = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          loadPartition(adapter, taskDef, `part-${i}`),
        ),
      );

      for (let i = 0; i < 5; i++) {
        expect(loaded[i]).toHaveLength(1);
        expect(loaded[i][0]!['name']).toBe(`P${i}-Item`);
      }
    });
  });

  describe('concurrent sync scheduler operations', () => {
    it('parallel schedule calls from multiple directions', () => {
      const scheduler = createSyncScheduler();

      // Schedule a bunch of tasks concurrently (sync, no real parallelism
      // but verifies internal state integrity under rapid calls)
      for (let i = 0; i < 20; i++) {
        const direction = i % 2 === 0 ? 'store-to-local' as const : 'local-to-cloud' as const;
        scheduler.schedule(direction, `entity.part-${i}`);
      }

      expect(scheduler.pending()).toBe(20);

      const flushed = scheduler.flush();
      expect(flushed).toHaveLength(20);
      expect(scheduler.pending()).toBe(0);
    });

    it('dirty tracker handles rapid mark/clear cycles', () => {
      const tracker = createDirtyTracker();
      const keys = Array.from({ length: 50 }, (_, i) => `entity.part-${i}`);

      // Mark all dirty
      for (const key of keys) tracker.markDirty(key);
      expect(tracker.getDirtyPartitions()).toHaveLength(50);

      // Clear half
      for (let i = 0; i < 25; i++) tracker.clear(keys[i]);
      expect(tracker.getDirtyPartitions()).toHaveLength(25);

      // Mark some already-dirty ones again (idempotent)
      for (let i = 25; i < 35; i++) tracker.markDirty(keys[i]);
      expect(tracker.getDirtyPartitions()).toHaveLength(25);

      // Clear all
      tracker.clearAll();
      expect(tracker.getDirtyPartitions()).toHaveLength(0);
    });
  });

  describe('multiple observables subscribing simultaneously', () => {
    it('multiple entity observables track independent entities', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'obs-device',
      });

      const id1 = await repo.save({ title: 'Item 1', done: false });
      const id2 = await repo.save({ title: 'Item 2', done: false });

      const obs1 = repo.observe(id1);
      const obs2 = repo.observe(id2);

      expect(obs1.getValue()?.title).toBe('Item 1');
      expect(obs2.getValue()?.title).toBe('Item 2');

      // Update only item 1
      await repo.save({ id: id1, title: 'Item 1 Updated', done: true } as TodoFields & { id: string });

      expect(obs1.getValue()?.title).toBe('Item 1 Updated');
      expect(obs2.getValue()?.title).toBe('Item 2'); // unchanged
    });

    it('collection observable and entity observable co-exist', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'coexist-device',
      });

      const collObs = repo.observeAll();
      expect(collObs.getValue()).toHaveLength(0);

      const id = await repo.save({ title: 'First', done: false });
      const entObs = repo.observe(id);

      // Both should reflect the entity
      expect(collObs.getValue()).toHaveLength(1);
      expect(entObs.getValue()?.title).toBe('First');

      // Add another entity
      await repo.save({ title: 'Second', done: true });
      expect(collObs.getValue()).toHaveLength(2);
      expect(entObs.getValue()?.title).toBe('First'); // unchanged
    });
  });

  describe('parallel tenant operations', () => {
    it('concurrent tenant creation and data population', async () => {
      const adapter = createMemoryBlobAdapter();
      const strata = track(createStrata({
        entities: [Todo],
        localAdapter: adapter,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'par-tenant-device',
      }));

      // Create tenants sequentially (they share state)
      const tenants = [];
      for (let i = 0; i < 3; i++) {
        tenants.push(await strata.tenants.create({ name: `Tenant-${i}` }));
      }

      // Populate each tenant sequentially (switch requires load)
      for (let i = 0; i < 3; i++) {
        await strata.load(tenants[i].id);
        const repo = strata.repo(Todo);
        await Promise.all(
          Array.from({ length: 3 }, (_, j) =>
            repo.save({ title: `T${i}-Item-${j}`, done: false }),
          ),
        );
      }

      // Verify each tenant has exactly 3 items
      for (let i = 0; i < 3; i++) {
        await strata.load(tenants[i].id);
        const repo = strata.repo(Todo);
        const all = await repo.getAll();
        expect(all).toHaveLength(3);
        for (const item of all) {
          expect(item.title).toMatch(new RegExp(`^T${i}-Item-`));
        }
      }
    });
  });

  describe('race conditions: save + delete on the same entity', () => {
    it('delete after save results in entity being removed', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'race-device',
      });

      const id = await repo.save({ title: 'Ephemeral', done: false });
      expect(await repo.get(id)).toBeDefined();

      // Simultaneous save + delete (delete wins because it runs after)
      await Promise.all([
        repo.save({ title: 'Another', done: true }),
        repo.delete(id),
      ]);

      const deleted = await repo.get(id);
      expect(deleted).toBeUndefined();

      // Other entity should still exist
      const all = await repo.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].title).toBe('Another');
    });

    it('multiple rapid saves to the same entity increment version', async () => {
      const { store, bus } = makeWiredStore();
      const repo = createRepository({
        entityDef: Todo,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'rapid-device',
      });

      const id = await repo.save({ title: 'V1', done: false });

      // Rapid sequential updates
      for (let i = 2; i <= 10; i++) {
        await repo.save({ id, title: `V${i}`, done: i % 2 === 0 } as TodoFields & { id: string });
      }

      const entity = await repo.get(id);
      expect(entity).toBeDefined();
      expect(entity!.title).toBe('V10');
      expect(entity!.version).toBe(10);
    });
  });
});
