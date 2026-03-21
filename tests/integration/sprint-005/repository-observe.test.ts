import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus, type EntityEvent } from '../../../src/reactive/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import { dateKeyStrategy } from '../../../src/key-strategy/index.js';
import { createRepository } from '../../../src/repository/repository.js';

type NoteFields = { text: string };
const Note = defineEntity<NoteFields>('Note');

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
    entityDef: Note,
    store,
    eventBus: bus,
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'dev-obs',
  });

  return { repo, store, bus, events };
}

describe('Integration: Repository observe / observeAll', () => {
  describe('observe (single entity)', () => {
    it('returns BehaviorSubject with current value after save', async () => {
      const { repo } = setup();
      const id = await repo.save({ text: 'Initial' });

      const obs = repo.observe(id);
      expect(obs.getValue()).toBeDefined();
      expect(obs.getValue()!.text).toBe('Initial');
    });

    it('observable updates when entity is saved again', async () => {
      const { repo } = setup();
      const id = await repo.save({ text: 'Before' });
      const obs = repo.observe(id);

      await repo.save({ id, text: 'After' } as never);
      expect(obs.getValue()!.text).toBe('After');
    });

    it('observable becomes undefined when entity is deleted', async () => {
      const { repo } = setup();
      const id = await repo.save({ text: 'Ephemeral' });
      const obs = repo.observe(id);

      await repo.delete(id);
      expect(obs.getValue()).toBeUndefined();
    });

    it('observable for non-existent entity starts undefined', () => {
      const { repo } = setup();
      const obs = repo.observe('Note.2026.nope');
      expect(obs.getValue()).toBeUndefined();
    });
  });

  describe('observeAll (collection)', () => {
    it('returns BehaviorSubject with current collection', async () => {
      const { repo } = setup();
      await repo.save({ text: 'One' });

      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(1);
    });

    it('collection grows when new entities are saved', async () => {
      const { repo } = setup();
      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(0);

      await repo.save({ text: 'A' });
      expect(obs.getValue()).toHaveLength(1);

      await repo.save({ text: 'B' });
      expect(obs.getValue()).toHaveLength(2);
    });

    it('collection shrinks when entity is deleted', async () => {
      const { repo } = setup();
      const id = await repo.save({ text: 'Remove' });
      await repo.save({ text: 'Keep' });

      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(2);

      await repo.delete(id);
      expect(obs.getValue()).toHaveLength(1);
    });

    it('collection reflects updates without changing length', async () => {
      const { repo } = setup();
      const id = await repo.save({ text: 'V1' });
      const obs = repo.observeAll();

      await repo.save({ id, text: 'V2' } as never);
      const items = obs.getValue();
      expect(items).toHaveLength(1);
      expect((items[0] as Record<string, unknown>).text).toBe('V2');
    });
  });
});
