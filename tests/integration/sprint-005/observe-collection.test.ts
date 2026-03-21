import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus } from '../../../src/reactive/index.js';
import { observeCollection } from '../../../src/reactive/observe-collection.js';
import type { StoreEntry } from '../../../src/store/index.js';

describe('Integration: observeCollection (observeAll)', () => {
  function makeEntity(id: string, title: string): StoreEntry {
    return {
      id,
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'd',
    } as StoreEntry;
  }

  function setup() {
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
    return { bus, store };
  }

  it('initial value reflects current store contents', () => {
    const { bus, store } = setup();
    store.save('Task.2026', makeEntity('Task.2026.a1', 'Alpha'));

    const { observable, destroy } = observeCollection(
      bus,
      'Task',
      () => store.getAll('Task.2026'),
    );

    expect(observable.getValue()).toHaveLength(1);
    destroy();
  });

  it('tracks additions via created events', () => {
    const { bus, store } = setup();

    const { observable, destroy } = observeCollection(
      bus,
      'Task',
      () => store.getAll('Task.2026'),
    );

    expect(observable.getValue()).toHaveLength(0);

    store.save('Task.2026', makeEntity('Task.2026.b1', 'New task'));
    expect(observable.getValue()).toHaveLength(1);

    store.save('Task.2026', makeEntity('Task.2026.b2', 'Another'));
    expect(observable.getValue()).toHaveLength(2);
    destroy();
  });

  it('tracks deletions via deleted events', () => {
    const { bus, store } = setup();
    store.save('Task.2026', makeEntity('Task.2026.c1', 'Temp'));

    const { observable, destroy } = observeCollection(
      bus,
      'Task',
      () => store.getAll('Task.2026'),
    );

    expect(observable.getValue()).toHaveLength(1);

    store.delete('Task.2026', 'Task.2026.c1');
    expect(observable.getValue()).toHaveLength(0);
    destroy();
  });

  it('filters by partitionKey when provided', () => {
    const { bus, store } = setup();

    const { observable, destroy } = observeCollection(
      bus,
      'Task',
      () => store.getAll('Task.2025'),
      '2025',
    );

    // Event for a different partition should not update our observable
    store.save('Task.2026', makeEntity('Task.2026.d1', 'Wrong partition'));
    expect(observable.getValue()).toHaveLength(0);

    // Same partition does update
    store.save('Task.2025', makeEntity('Task.2025.d2', 'Right partition'));
    expect(observable.getValue()).toHaveLength(1);
    destroy();
  });

  it('ignores events for a different entityName', () => {
    const { bus, store } = setup();

    const { observable, destroy } = observeCollection(
      bus,
      'Task',
      () => store.getAll('Task.2026'),
    );

    // Save a "Note" entity — should not affect Task observable
    store.save('Note.2026', makeEntity('Note.2026.e1', 'Irrelevant'));
    expect(observable.getValue()).toHaveLength(0);
    destroy();
  });

  it('destroy stops tracking changes', () => {
    const { bus, store } = setup();

    const { observable, destroy } = observeCollection(
      bus,
      'Task',
      () => store.getAll('Task.2026'),
    );

    destroy();

    store.save('Task.2026', makeEntity('Task.2026.f1', 'After destroy'));
    // Observable is completed; value stays at last known
    expect(observable.getValue()).toHaveLength(0);
  });
});
