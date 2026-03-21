import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus, type EntityEvent } from '../../../src/reactive/index.js';

/**
 * Integration: wiring EntityStore callbacks to EntityEventBus so that
 * store mutations automatically emit the correct events.
 */
describe('Integration: Store-Event Wiring', () => {
  function setup() {
    const bus = createEntityEventBus();
    const events: EntityEvent[] = [];
    bus.on((e) => events.push(e));

    const store = createEntityStore({
      onEntitySaved(entityKey, entity, isNew) {
        const dotIndex = entityKey.indexOf('.');
        bus.emit({
          type: isNew ? 'created' : 'updated',
          entityName: entityKey.substring(0, dotIndex),
          partitionKey: entityKey.substring(dotIndex + 1),
          entityId: entity.id,
          entity: entity as Readonly<Record<string, unknown>>,
        });
      },
      onEntityDeleted(entityKey, id) {
        const dotIndex = entityKey.indexOf('.');
        bus.emit({
          type: 'deleted',
          entityName: entityKey.substring(0, dotIndex),
          partitionKey: entityKey.substring(dotIndex + 1),
          entityId: id,
          entity: undefined,
        });
      },
    });

    return { store, bus, events };
  }

  it('emits created event when a new entity is saved', () => {
    const { store, events } = setup();
    store.save('Todo.2026', {
      id: 'Todo.2026.a1',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
      title: 'First',
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('created');
    expect(events[0]!.entityName).toBe('Todo');
    expect(events[0]!.partitionKey).toBe('2026');
    expect(events[0]!.entityId).toBe('Todo.2026.a1');
    expect(events[0]!.entity).toBeDefined();
  });

  it('emits updated event when an existing entity is saved again', () => {
    const { store, events } = setup();
    const entity = {
      id: 'Todo.2026.u1',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
      title: 'Original',
    };
    store.save('Todo.2026', entity);
    store.save('Todo.2026', { ...entity, title: 'Updated', version: 2, updatedAt: new Date() });

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('created');
    expect(events[1]!.type).toBe('updated');
    expect((events[1]!.entity as Record<string, unknown>).title).toBe('Updated');
  });

  it('emits deleted event when entity is removed', () => {
    const { store, events } = setup();
    store.save('Todo.2026', {
      id: 'Todo.2026.d1',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
      title: 'Delete me',
    });
    events.length = 0; // clear the created event

    store.delete('Todo.2026', 'Todo.2026.d1');

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('deleted');
    expect(events[0]!.entityId).toBe('Todo.2026.d1');
    expect(events[0]!.entity).toBeUndefined();
  });

  it('does not emit when deleting a non-existent entity', () => {
    const { store, events } = setup();
    store.delete('Todo.2026', 'Todo.2026.nope');
    expect(events).toHaveLength(0);
  });

  it('multiple saves across partitions produce independent events', () => {
    const { store, events } = setup();
    store.save('Todo.2025', {
      id: 'Todo.2025.x',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
    });
    store.save('Todo.2026', {
      id: 'Todo.2026.y',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.partitionKey).toBe('2025');
    expect(events[1]!.partitionKey).toBe('2026');
  });
});
