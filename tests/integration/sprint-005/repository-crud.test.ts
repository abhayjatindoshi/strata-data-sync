import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus, type EntityEvent } from '../../../src/reactive/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import { dateKeyStrategy } from '../../../src/key-strategy/index.js';
import { createRepository } from '../../../src/repository/repository.js';

type TodoFields = { title: string; done: boolean };
const Todo = defineEntity<TodoFields>('Todo');

function setup() {
  const bus = createEntityEventBus();
  const events: EntityEvent[] = [];
  bus.on((e) => events.push(e));

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

  const repo = createRepository({
    entityDef: Todo,
    store,
    eventBus: bus,
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'test-device',
  });

  return { repo, store, bus, events };
}

describe('Integration: Repository CRUD', () => {
  describe('save + get', () => {
    it('saves a new entity and retrieves it by id', async () => {
      const { repo } = setup();
      const id = await repo.save({ title: 'Buy groceries', done: false });

      expect(id).toContain('Todo.');

      const entity = await repo.get(id);
      expect(entity).toBeDefined();
      expect(entity!.title).toBe('Buy groceries');
      expect(entity!.done).toBe(false);
      expect(entity!.id).toBe(id);
    });

    it('assigns base entity fields automatically', async () => {
      const { repo } = setup();
      const id = await repo.save({ title: 'Test', done: false });
      const entity = await repo.get(id);

      expect(entity!.version).toBe(1);
      expect(entity!.device).toBe('test-device');
      expect(entity!.createdAt).toBeInstanceOf(Date);
      expect(entity!.updatedAt).toBeInstanceOf(Date);
    });

    it('increments version on re-save', async () => {
      const { repo } = setup();
      const id = await repo.save({ title: 'V1', done: false });
      await repo.save({ id, title: 'V2', done: true } as never);

      const entity = await repo.get(id);
      expect(entity!.version).toBe(2);
      expect(entity!.title).toBe('V2');
    });
  });

  describe('getAll', () => {
    it('returns all saved entities', async () => {
      const { repo } = setup();
      await repo.save({ title: 'A', done: false });
      await repo.save({ title: 'B', done: true });

      const all = await repo.getAll();
      expect(all).toHaveLength(2);
    });

    it('returns empty array when nothing saved', async () => {
      const { repo } = setup();
      const all = await repo.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('removes an entity and get returns undefined', async () => {
      const { repo } = setup();
      const id = await repo.save({ title: 'Remove me', done: false });
      const deleted = await repo.delete(id);

      expect(deleted).toBe(true);
      expect(await repo.get(id)).toBeUndefined();
    });

    it('returns false when deleting a non-existent entity', async () => {
      const { repo } = setup();
      const deleted = await repo.delete('Todo.2026.nonexistent');
      expect(deleted).toBe(false);
    });

    it('getAll reflects delete', async () => {
      const { repo } = setup();
      const id = await repo.save({ title: 'Gone', done: false });
      await repo.save({ title: 'Stays', done: false });

      await repo.delete(id);
      const all = await repo.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.title).toBe('Stays');
    });
  });

  describe('events from CRUD', () => {
    it('save emits created event for new entity', async () => {
      const { repo, events } = setup();
      await repo.save({ title: 'New', done: false });

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('created');
      expect(events[0]!.entityName).toBe('Todo');
    });

    it('save emits updated event for existing entity', async () => {
      const { repo, events } = setup();
      const id = await repo.save({ title: 'First', done: false });
      await repo.save({ id, title: 'Second', done: true } as never);

      expect(events[1]!.type).toBe('updated');
    });

    it('delete emits deleted event', async () => {
      const { repo, events } = setup();
      const id = await repo.save({ title: 'Del', done: false });
      events.length = 0;

      await repo.delete(id);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('deleted');
      expect(events[0]!.entityId).toBe(id);
    });
  });
});
