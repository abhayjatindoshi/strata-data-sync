import { describe, it, expect, vi } from 'vitest';
import { createEntityEventBus } from './entity-event-bus';
import type { EntityEvent } from './event-types';

function makeEvent(overrides: Partial<EntityEvent> = {}): EntityEvent {
  return {
    type: 'created',
    entityName: 'Account',
    partitionKey: 'global',
    entityId: 'Account.global.abc',
    entity: { id: 'Account.global.abc', name: 'Test' },
    ...overrides,
  };
}

describe('createEntityEventBus', () => {
  it('emits events to registered listeners', () => {
    const bus = createEntityEventBus();
    const listener = vi.fn();
    bus.on(listener);

    const event = makeEvent();
    bus.emit(event);

    expect(listener).toHaveBeenCalledWith(event);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple listeners', () => {
    const bus = createEntityEventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    bus.on(listener1);
    bus.on(listener2);

    const event = makeEvent();
    bus.emit(event);

    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
  });

  it('removes listener with off', () => {
    const bus = createEntityEventBus();
    const listener = vi.fn();
    bus.on(listener);
    bus.off(listener);

    bus.emit(makeEvent());

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not fail when emitting with no listeners', () => {
    const bus = createEntityEventBus();
    expect(() => bus.emit(makeEvent())).not.toThrow();
  });

  it('ignores duplicate listener registration', () => {
    const bus = createEntityEventBus();
    const listener = vi.fn();
    bus.on(listener);
    bus.on(listener);

    bus.emit(makeEvent());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('carries entity snapshot for created events', () => {
    const bus = createEntityEventBus();
    const listener = vi.fn();
    bus.on(listener);

    const entity = { id: 'Txn.2025.xyz', amount: 100 };
    bus.emit(makeEvent({ type: 'created', entity }));

    expect(listener.mock.calls[0]![0].entity).toEqual(entity);
  });

  it('carries undefined entity for deleted events', () => {
    const bus = createEntityEventBus();
    const listener = vi.fn();
    bus.on(listener);

    bus.emit(makeEvent({ type: 'deleted', entity: undefined }));

    expect(listener.mock.calls[0]![0].entity).toBeUndefined();
  });
});
