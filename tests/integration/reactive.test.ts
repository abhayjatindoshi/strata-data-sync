import { describe, it, expect } from 'vitest';
import { createEntityStore } from '@strata/store';
import {
  createEntityEventBus,
  observeEntity,
  observeCollection,
} from '@strata/reactive';
import type { EntityEvent, EntityEventListener } from '@strata/reactive';
import type { StoreEntry } from '@strata/store';

// ── EntityEventBus ──────────────────────────────────────────────────
describe('EntityEventBus', () => {
  function makeEvent(overrides?: Partial<EntityEvent>): EntityEvent {
    return {
      type: 'created',
      entityName: 'Todo',
      partitionKey: '2026',
      entityId: 'Todo.2026.abc',
      entity: { id: 'Todo.2026.abc', title: 'Buy milk' },
      ...overrides,
    };
  }

  it('delivers emitted events to subscribers', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    bus.on((e: EntityEvent) => received.push(e));

    const event = makeEvent();
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('supports multiple subscribers', () => {
    const bus = createEntityEventBus();
    const a: EntityEvent[] = [];
    const b: EntityEvent[] = [];

    bus.on((e: EntityEvent) => a.push(e));
    bus.on((e: EntityEvent) => b.push(e));

    bus.emit(makeEvent());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('stops delivering after unsubscribe (off)', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    const listener: EntityEventListener = (e: EntityEvent) => received.push(e);

    bus.on(listener);
    bus.emit(makeEvent());
    expect(received).toHaveLength(1);

    bus.off(listener);
    bus.emit(makeEvent({ entityId: 'Todo.2026.xyz' }));
    expect(received).toHaveLength(1);
  });

  it('delivers all three mutation event types', () => {
    const bus = createEntityEventBus();
    const types: string[] = [];
    bus.on((e: EntityEvent) => types.push(e.type));

    bus.emit(makeEvent({ type: 'created' }));
    bus.emit(makeEvent({ type: 'updated' }));
    bus.emit(makeEvent({ type: 'deleted', entity: undefined }));

    expect(types).toEqual(['created', 'updated', 'deleted']);
  });

  it('event carries entity snapshot for created/updated', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    bus.on((e: EntityEvent) => received.push(e));

    const snapshot = { id: 'Todo.2026.snap', title: 'Snapshot' };
    bus.emit(makeEvent({ type: 'created', entity: snapshot }));
    bus.emit(makeEvent({ type: 'updated', entity: { ...snapshot, title: 'Modified' } }));

    expect(received[0]!.entity).toEqual(snapshot);
    expect((received[1]!.entity as Record<string, unknown>).title).toBe('Modified');
  });

  it('event carries undefined entity for deleted', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    bus.on((e: EntityEvent) => received.push(e));

    bus.emit(makeEvent({ type: 'deleted', entity: undefined }));
    expect(received[0]!.entity).toBeUndefined();
  });

  it('off is idempotent for unknown listener', () => {
    const bus = createEntityEventBus();
    const stranger: EntityEventListener = () => {};
    bus.off(stranger);
  });
});

// ── observeEntity ───────────────────────────────────────────────────
describe('observeEntity', () => {
  function makeEntity(id: string, title: string) {
    return { id, title, createdAt: new Date(), updatedAt: new Date(), version: 1, device: 'd' };
  }

  it('initial value is returned from getCurrentValue', () => {
    const bus = createEntityEventBus();
    const entity = makeEntity('Note.2026.a', 'Hello');
    const { observable, destroy } = observeEntity(bus, 'Note.2026.a', () => entity);

    expect(observable.getValue()).toBeDefined();
    expect(observable.getValue()!.title).toBe('Hello');
    destroy();
  });

  it('initial value is undefined when entity does not exist', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity(bus, 'Note.2026.missing', () => undefined);

    expect(observable.getValue()).toBeUndefined();
    destroy();
  });

  it('updates on mutation event for matching entityId', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity<Record<string, unknown>>(
      bus,
      'Note.2026.b',
      () => undefined,
    );

    const updated = makeEntity('Note.2026.b', 'Updated');
    bus.emit({
      type: 'updated',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.b',
      entity: updated,
    });

    expect(observable.getValue()).toBeDefined();
    expect((observable.getValue() as Record<string, unknown>).title).toBe('Updated');
    destroy();
  });

  it('ignores events for different entityId', () => {
    const bus = createEntityEventBus();
    const initial = makeEntity('Note.2026.c', 'Mine');
    const { observable, destroy } = observeEntity(bus, 'Note.2026.c', () => initial);

    bus.emit({
      type: 'updated',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.other',
      entity: makeEntity('Note.2026.other', 'Not mine'),
    });

    expect(observable.getValue()!.title).toBe('Mine');
    destroy();
  });

  it('becomes undefined on delete event', () => {
    const bus = createEntityEventBus();
    const initial = makeEntity('Note.2026.d', 'Doomed');
    const { observable, destroy } = observeEntity(bus, 'Note.2026.d', () => initial);

    bus.emit({
      type: 'deleted',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.d',
      entity: undefined,
    });

    expect(observable.getValue()).toBeUndefined();
    destroy();
  });

  it('distinctUntilChanged suppresses duplicate snapshots', () => {
    const bus = createEntityEventBus();
    const entity = makeEntity('Note.2026.e', 'Same');
    const { observable, destroy } = observeEntity<Record<string, unknown>>(
      bus,
      'Note.2026.e',
      () => entity,
    );

    const emissions: unknown[] = [];
    observable.subscribe((v: unknown) => emissions.push(v));

    bus.emit({
      type: 'updated',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.e',
      entity: { ...entity },
    });

    expect(emissions).toHaveLength(1);
    destroy();
  });

  it('destroy stops listening to further events', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity<Record<string, unknown>>(
      bus,
      'Note.2026.f',
      () => undefined,
    );

    destroy();

    bus.emit({
      type: 'created',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.f',
      entity: makeEntity('Note.2026.f', 'Late'),
    });

    expect(observable.getValue()).toBeUndefined();
  });

  it('tracks multiple sequential updates', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity<Record<string, unknown>>(
      bus,
      'Note.2026.g',
      () => undefined,
    );

    const values: string[] = [];
    observable.subscribe((v) => {
      values.push(v ? (v as Record<string, unknown>).title as string : 'undefined');
    });

    bus.emit({
      type: 'created',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.g',
      entity: makeEntity('Note.2026.g', 'V1'),
    });

    bus.emit({
      type: 'updated',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.g',
      entity: { ...makeEntity('Note.2026.g', 'V2') },
    });

    bus.emit({
      type: 'deleted',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.g',
      entity: undefined,
    });

    expect(values).toEqual(['undefined', 'V1', 'V2', 'undefined']);
    destroy();
  });
});

// ── observeCollection ───────────────────────────────────────────────
describe('observeCollection (observeAll)', () => {
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

    store.save('Task.2026', makeEntity('Task.2026.d1', 'Wrong partition'));
    expect(observable.getValue()).toHaveLength(0);

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
    expect(observable.getValue()).toHaveLength(0);
  });
});

// ── Store-Event Wiring ──────────────────────────────────────────────
describe('Store-Event Wiring', () => {
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
    events.length = 0;

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
