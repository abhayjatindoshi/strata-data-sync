import { describe, it, expect } from 'vitest';
import { createEntityEventBus } from './entity-event-bus.js';
import { observeEntity } from './observe-entity.js';

describe('observeEntity', () => {
  it('emits initial value from getCurrentValue', () => {
    const bus = createEntityEventBus();
    const entity = { id: 'Acct.global.a1', name: 'Checking' };
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => entity);

    expect(observable.getValue()).toEqual(entity);
    destroy();
  });

  it('emits undefined when entity does not exist', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => undefined);

    expect(observable.getValue()).toBeUndefined();
    destroy();
  });

  it('updates on created event', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => undefined);

    const entity = { id: 'Acct.global.a1', name: 'Savings' };
    bus.emit({
      type: 'created',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity,
    });

    expect(observable.getValue()).toEqual(entity);
    destroy();
  });

  it('updates on updated event', () => {
    const bus = createEntityEventBus();
    const initial = { id: 'Acct.global.a1', name: 'Old' };
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => initial);

    const updated = { id: 'Acct.global.a1', name: 'New' };
    bus.emit({
      type: 'updated',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: updated,
    });

    expect(observable.getValue()).toEqual(updated);
    destroy();
  });

  it('emits undefined on deleted event', () => {
    const bus = createEntityEventBus();
    const entity = { id: 'Acct.global.a1', name: 'Test' };
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => entity);

    bus.emit({
      type: 'deleted',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: undefined,
    });

    expect(observable.getValue()).toBeUndefined();
    destroy();
  });

  it('ignores events for other entities', () => {
    const bus = createEntityEventBus();
    const entity = { id: 'Acct.global.a1', name: 'Mine' };
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => entity);

    bus.emit({
      type: 'updated',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a2',
      entity: { id: 'Acct.global.a2', name: 'Other' },
    });

    expect(observable.getValue()).toEqual(entity);
    destroy();
  });

  it('deduplicates identical snapshots via distinctUntilChanged', () => {
    const bus = createEntityEventBus();
    const entity = { id: 'Acct.global.a1', name: 'Same' };
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => entity);

    const emissions: unknown[] = [];
    observable.subscribe((val) => emissions.push(val));

    // Emit same entity again
    bus.emit({
      type: 'updated',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: { id: 'Acct.global.a1', name: 'Same' },
    });

    // Should only have the initial emission (deduped)
    expect(emissions).toHaveLength(1);
    destroy();
  });

  it('stops emitting after destroy', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeEntity(bus, 'Acct.global.a1', () => undefined);

    destroy();

    bus.emit({
      type: 'created',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: { id: 'Acct.global.a1', name: 'Late' },
    });

    // BehaviorSubject is completed, value stays undefined
    expect(observable.getValue()).toBeUndefined();
  });
});
