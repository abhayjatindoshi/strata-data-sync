import { describe, it, expect } from 'vitest';
import { createSyncEventEmitter } from '@strata/sync';
import type { SyncEvent } from '@strata/sync';

describe('createSyncEventEmitter', () => {
  it('on/emit delivers events to listeners', () => {
    const emitter = createSyncEventEmitter();
    const events: SyncEvent[] = [];

    emitter.on(e => events.push(e));
    emitter.emit({ type: 'sync-started' });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('sync-started');
  });

  it('off removes listener', () => {
    const emitter = createSyncEventEmitter();
    const events: SyncEvent[] = [];
    const listener = (e: SyncEvent) => events.push(e);

    emitter.on(listener);
    emitter.emit({ type: 'sync-started' });
    emitter.off(listener);
    emitter.emit({ type: 'sync-started' });

    expect(events).toHaveLength(1);
  });

  it('delivers sync-completed with result', () => {
    const emitter = createSyncEventEmitter();
    const events: SyncEvent[] = [];

    emitter.on(e => events.push(e));
    emitter.emit({
      type: 'sync-completed',
      result: { entitiesUpdated: 5, conflictsResolved: 2, partitionsSynced: 3 },
    });

    expect(events[0]).toEqual({
      type: 'sync-completed',
      result: { entitiesUpdated: 5, conflictsResolved: 2, partitionsSynced: 3 },
    });
  });

  it('delivers sync-failed with error', () => {
    const emitter = createSyncEventEmitter();
    const events: SyncEvent[] = [];

    emitter.on(e => events.push(e));
    const error = new Error('network error');
    emitter.emit({ type: 'sync-failed', error });

    const event = events[0] as { type: 'sync-failed'; error: Error };
    expect(event.type).toBe('sync-failed');
    expect(event.error.message).toBe('network error');
  });

  it('delivers cloud-unreachable event', () => {
    const emitter = createSyncEventEmitter();
    const events: SyncEvent[] = [];

    emitter.on(e => events.push(e));
    emitter.emit({ type: 'cloud-unreachable' });

    expect(events[0].type).toBe('cloud-unreachable');
  });

  it('multiple listeners all receive events', () => {
    const emitter = createSyncEventEmitter();
    const events1: SyncEvent[] = [];
    const events2: SyncEvent[] = [];

    emitter.on(e => events1.push(e));
    emitter.on(e => events2.push(e));
    emitter.emit({ type: 'sync-started' });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it('emit with no listeners is safe', () => {
    const emitter = createSyncEventEmitter();
    expect(() => emitter.emit({ type: 'sync-started' })).not.toThrow();
  });
});
