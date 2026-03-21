import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus } from '../../../src/reactive/index.js';
import type { EntityEvent } from '../../../src/reactive/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import { dateKeyStrategy } from '../../../src/key-strategy/index.js';
import { createRepository } from '../../../src/repository/repository.js';

type TaskFields = { title: string; status: string; priority: number };
const Task = defineEntity<TaskFields>('Task');

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
    entityDef: Task,
    store,
    eventBus: bus,
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'dev-1',
  });

  return { repo, store, bus, events };
}

describe('Integration: Repository with Queries', () => {
  describe('getAll with filters', () => {
    it('returns all entities when no filter given', async () => {
      const { repo } = setup();
      await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });
      await repo.save({ title: 'C', status: 'open', priority: 3 });

      const all = await repo.getAll();
      expect(all).toHaveLength(3);
    });

    it('filters by field matching (where)', async () => {
      const { repo } = setup();
      await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });
      await repo.save({ title: 'C', status: 'open', priority: 3 });

      const open = await repo.getAll({ where: { status: 'open' } });
      expect(open).toHaveLength(2);
      expect(open.every((t) => t.status === 'open')).toBe(true);
    });

    it('filters by id list', async () => {
      const { repo } = setup();
      const id1 = await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });
      const id3 = await repo.save({ title: 'C', status: 'open', priority: 3 });

      const subset = await repo.getAll({ ids: [id1, id3] });
      expect(subset).toHaveLength(2);
      expect(subset.map((t) => t.id)).toContain(id1);
      expect(subset.map((t) => t.id)).toContain(id3);
    });

    it('sorts results by priority ascending', async () => {
      const { repo } = setup();
      await repo.save({ title: 'High', status: 'open', priority: 3 });
      await repo.save({ title: 'Low', status: 'open', priority: 1 });
      await repo.save({ title: 'Mid', status: 'open', priority: 2 });

      const sorted = await repo.getAll({
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(sorted.map((t) => t.priority)).toEqual([1, 2, 3]);
    });

    it('combines where + orderBy', async () => {
      const { repo } = setup();
      await repo.save({ title: 'A', status: 'open', priority: 3 });
      await repo.save({ title: 'B', status: 'closed', priority: 1 });
      await repo.save({ title: 'C', status: 'open', priority: 1 });

      const result = await repo.getAll({
        where: { status: 'open' },
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].priority).toBe(1);
      expect(result[1].priority).toBe(3);
    });
  });

  describe('observeAll with queries', () => {
    it('observable returns filtered results', async () => {
      const { repo } = setup();
      await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });

      const obs$ = repo.observeAll({ where: { status: 'open' } });
      const snapshot = obs$.getValue();
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].status).toBe('open');
    });

    it('observable returns sorted results', async () => {
      const { repo } = setup();
      await repo.save({ title: 'Z', status: 'open', priority: 3 });
      await repo.save({ title: 'A', status: 'open', priority: 1 });

      const obs$ = repo.observeAll({
        orderBy: [{ field: 'title', direction: 'asc' }],
      });
      const snapshot = obs$.getValue();
      expect(snapshot[0].title).toBe('A');
      expect(snapshot[1].title).toBe('Z');
    });

    it('observable updates when matching entity is added', async () => {
      const { repo } = setup();
      await repo.save({ title: 'A', status: 'open', priority: 1 });

      const obs$ = repo.observeAll({ where: { status: 'open' } });
      expect(obs$.getValue()).toHaveLength(1);

      await repo.save({ title: 'B', status: 'open', priority: 2 });
      expect(obs$.getValue()).toHaveLength(2);
    });
  });
});
