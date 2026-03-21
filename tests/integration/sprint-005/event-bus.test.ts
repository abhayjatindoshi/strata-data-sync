import { describe, it, expect } from 'vitest';
import {
  createEntityEventBus,
  type EntityEvent,
  type EntityEventListener,
} from '../../../src/reactive/index.js';

describe('Integration: EntityEventBus', () => {
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
    bus.on((e) => received.push(e));

    const event = makeEvent();
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('supports multiple subscribers', () => {
    const bus = createEntityEventBus();
    const a: EntityEvent[] = [];
    const b: EntityEvent[] = [];

    bus.on((e) => a.push(e));
    bus.on((e) => b.push(e));

    bus.emit(makeEvent());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('stops delivering after unsubscribe (off)', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    const listener: EntityEventListener = (e) => received.push(e);

    bus.on(listener);
    bus.emit(makeEvent());
    expect(received).toHaveLength(1);

    bus.off(listener);
    bus.emit(makeEvent({ entityId: 'Todo.2026.xyz' }));
    expect(received).toHaveLength(1); // no new events
  });

  it('delivers all three mutation event types', () => {
    const bus = createEntityEventBus();
    const types: string[] = [];
    bus.on((e) => types.push(e.type));

    bus.emit(makeEvent({ type: 'created' }));
    bus.emit(makeEvent({ type: 'updated' }));
    bus.emit(makeEvent({ type: 'deleted', entity: undefined }));

    expect(types).toEqual(['created', 'updated', 'deleted']);
  });

  it('event carries entity snapshot for created/updated', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    bus.on((e) => received.push(e));

    const snapshot = { id: 'Todo.2026.snap', title: 'Snapshot' };
    bus.emit(makeEvent({ type: 'created', entity: snapshot }));
    bus.emit(makeEvent({ type: 'updated', entity: { ...snapshot, title: 'Modified' } }));

    expect(received[0]!.entity).toEqual(snapshot);
    expect((received[1]!.entity as Record<string, unknown>).title).toBe('Modified');
  });

  it('event carries undefined entity for deleted', () => {
    const bus = createEntityEventBus();
    const received: EntityEvent[] = [];
    bus.on((e) => received.push(e));

    bus.emit(makeEvent({ type: 'deleted', entity: undefined }));
    expect(received[0]!.entity).toBeUndefined();
  });

  it('off is idempotent for unknown listener', () => {
    const bus = createEntityEventBus();
    const stranger: EntityEventListener = () => {};
    // Should not throw
    bus.off(stranger);
  });
});
