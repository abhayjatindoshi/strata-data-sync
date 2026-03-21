import { describe, it, expect } from 'vitest';
import { createEntityEventBus } from '../../../src/reactive/index.js';
import { observeEntity } from '../../../src/reactive/observe-entity.js';
import type { EntityEvent } from '../../../src/reactive/index.js';

describe('Integration: observeEntity', () => {
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

    // Should still be the initial value
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
    observable.subscribe((v) => emissions.push(v));

    // Emit an event with a structurally identical entity (different object reference)
    bus.emit({
      type: 'updated',
      entityName: 'Note',
      partitionKey: '2026',
      entityId: 'Note.2026.e',
      entity: { ...entity },
    });

    // Initial + no duplicate = 1 emission from subscribe (BehaviorSubject emits current on subscribe)
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

    // Value should remain undefined — the subject is completed
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
