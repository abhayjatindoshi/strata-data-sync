import { describe, it, expect } from 'vitest';
import { createEntityEventBus } from './entity-event-bus.js';
import { observeCollection } from './observe-collection.js';

describe('observeCollection', () => {
  it('emits initial values from getCurrentValues', () => {
    const bus = createEntityEventBus();
    const items = [{ id: 'Acct.global.a1', name: 'A' }];
    const { observable, destroy } = observeCollection(bus, 'Acct', () => items);

    expect(observable.getValue()).toEqual(items);
    destroy();
  });

  it('emits empty array when no entities exist', () => {
    const bus = createEntityEventBus();
    const { observable, destroy } = observeCollection(bus, 'Acct', () => []);

    expect(observable.getValue()).toEqual([]);
    destroy();
  });

  it('updates when entity in collection is created', () => {
    const bus = createEntityEventBus();
    let items: readonly Record<string, unknown>[] = [];

    const { observable, destroy } = observeCollection(bus, 'Acct', () => items);
    expect(observable.getValue()).toEqual([]);

    const entity = { id: 'Acct.global.a1', name: 'New' };
    items = [entity];
    bus.emit({
      type: 'created',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity,
    });

    expect(observable.getValue()).toEqual([entity]);
    destroy();
  });

  it('updates when entity is deleted from collection', () => {
    const bus = createEntityEventBus();
    const entity = { id: 'Acct.global.a1', name: 'Del' };
    let items: readonly Record<string, unknown>[] = [entity];

    const { observable, destroy } = observeCollection(bus, 'Acct', () => items);
    expect(observable.getValue()).toEqual([entity]);

    items = [];
    bus.emit({
      type: 'deleted',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: undefined,
    });

    expect(observable.getValue()).toEqual([]);
    destroy();
  });

  it('ignores events for other entity names', () => {
    const bus = createEntityEventBus();
    const items = [{ id: 'Acct.global.a1', name: 'Mine' }];
    const { observable, destroy } = observeCollection(bus, 'Acct', () => items);

    bus.emit({
      type: 'created',
      entityName: 'Transaction',
      partitionKey: '2025',
      entityId: 'Transaction.2025.t1',
      entity: { id: 'Transaction.2025.t1' },
    });

    expect(observable.getValue()).toEqual(items);
    destroy();
  });

  it('filters by partitionKey when provided', () => {
    const bus = createEntityEventBus();
    const items = [{ id: 'Txn.2024.t1', amount: 10 }];
    let current: readonly Record<string, unknown>[] = items;

    const { observable, destroy } = observeCollection(
      bus, 'Txn', () => current, '2024',
    );

    // Event for different partition — should be ignored
    bus.emit({
      type: 'created',
      entityName: 'Txn',
      partitionKey: '2025',
      entityId: 'Txn.2025.t2',
      entity: { id: 'Txn.2025.t2', amount: 20 },
    });

    expect(observable.getValue()).toEqual(items);

    // Event for matching partition — should trigger update
    const newItem = { id: 'Txn.2024.t3', amount: 30 };
    current = [...items, newItem];
    bus.emit({
      type: 'created',
      entityName: 'Txn',
      partitionKey: '2024',
      entityId: 'Txn.2024.t3',
      entity: newItem,
    });

    expect(observable.getValue()).toHaveLength(2);
    destroy();
  });

  it('deduplicates when array reference is same', () => {
    const bus = createEntityEventBus();
    const items = [{ id: 'Acct.global.a1', name: 'Static' }];
    const { observable, destroy } = observeCollection(bus, 'Acct', () => items);

    const emissions: unknown[] = [];
    observable.subscribe((val) => emissions.push(val));

    // Emit event but getCurrentValues returns same array reference
    bus.emit({
      type: 'updated',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: { id: 'Acct.global.a1', name: 'Static' },
    });

    expect(emissions).toHaveLength(1);
    destroy();
  });

  it('stops emitting after destroy', () => {
    const bus = createEntityEventBus();
    let items: readonly Record<string, unknown>[] = [];
    const { observable, destroy } = observeCollection(bus, 'Acct', () => items);

    destroy();

    items = [{ id: 'Acct.global.a1' }];
    bus.emit({
      type: 'created',
      entityName: 'Acct',
      partitionKey: 'global',
      entityId: 'Acct.global.a1',
      entity: { id: 'Acct.global.a1' },
    });

    expect(observable.getValue()).toEqual([]);
  });
});
