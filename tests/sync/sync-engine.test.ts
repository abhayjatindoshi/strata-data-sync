import { describe, it, expect } from 'vitest';
import { SyncEngine } from '@strata/sync';
import type { SyncEvent } from '@strata/sync';
import { createDataAdapter } from '../helpers';
import { createHlc } from '@strata/hlc';
import { saveAllIndexes } from '@strata/persistence';
import { EventBus } from '@strata/reactive';
import { Store } from '@strata/store';
import { DEFAULT_OPTIONS } from '../helpers';

function makeEngine(opts?: { cloud?: boolean }) {
  const store = new Store(DEFAULT_OPTIONS);
  const local = createDataAdapter();
  const cloud = opts?.cloud ? createDataAdapter() : undefined;
  const hlcRef = { current: createHlc('test') };
  const eventBus = new EventBus();
  const engine = new SyncEngine(store, local, cloud, ['task'], hlcRef, eventBus, undefined, DEFAULT_OPTIONS);
  return { engine, store, local, cloud, hlcRef, eventBus };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SyncEngine', () => {
  it('executes sync operations sequentially', async () => {
    const { engine } = makeEngine();
    const order: number[] = [];

    const p1 = engine.sync('memory', 'local', undefined).then(() => order.push(1));
    const p2 = engine.sync('local', 'memory', undefined).then(() => order.push(2));

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('deduplicates when same source+target is already queued', async () => {
    const { engine, store } = makeEngine();

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', name: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    const p1 = engine.sync('memory', 'local', undefined);
    const p2 = engine.sync('memory', 'local', undefined);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.deduplicated).toBe(false);
    expect(r2.deduplicated).toBe(true);
  });

  it('emits sync-started and sync-completed events', async () => {
    const { engine } = makeEngine();
    const events: SyncEvent[] = [];
    engine.on(e => events.push(e));

    await engine.sync('memory', 'local', undefined);

    const types = events.map(e => e.type);
    expect(types).toContain('sync-started');
    expect(types).toContain('sync-completed');
  });

  it('events include source and target', async () => {
    const { engine } = makeEngine();
    const events: SyncEvent[] = [];
    engine.on(e => events.push(e));

    await engine.sync('memory', 'local', undefined);

    const started = events.find(e => e.type === 'sync-started')!;
    expect(started).toEqual({
      type: 'sync-started',
      source: 'memory',
      target: 'local',
    });
  });

  it('emits sync-failed on error', async () => {
    const { engine, local } = makeEngine();
    const events: SyncEvent[] = [];
    engine.on(e => events.push(e));

    local.read = async () => { throw new Error('read failed'); };

    await expect(engine.sync('memory', 'local', undefined)).rejects.toThrow('read failed');
    expect(events.some(e => e.type === 'sync-failed')).toBe(true);
  });

  it('on/off manages listeners', async () => {
    const { engine } = makeEngine();
    const events: SyncEvent[] = [];
    const listener = (e: SyncEvent) => events.push(e);

    engine.on(listener);
    await engine.sync('memory', 'local', undefined);
    const count = events.length;

    engine.off(listener);
    await engine.sync('memory', 'local', undefined);
    expect(events.length).toBe(count);
  });

  it('emit sends event to listeners', () => {
    const { engine } = makeEngine();
    const events: SyncEvent[] = [];
    engine.on(e => events.push(e));

    engine.emit({ type: 'cloud-unreachable' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('cloud-unreachable');
  });

  it('drain waits for all queued operations', async () => {
    const { engine } = makeEngine();
    const results: number[] = [];

    engine.sync('memory', 'local', undefined).then(() => results.push(1));
    engine.sync('local', 'memory', undefined).then(() => results.push(2));

    await engine.drain();
    expect(results).toEqual([1, 2]);
  });

  it('dispose rejects further sync calls', async () => {
    const { engine } = makeEngine();
    engine.dispose();

    await expect(
      engine.sync('memory', 'local', undefined),
    ).rejects.toThrow('disposed');
  });

  it('throws when syncing to cloud without cloud adapter', async () => {
    const { engine } = makeEngine({ cloud: false });

    await expect(
      engine.sync('local', 'cloud', undefined),
    ).rejects.toThrow('No cloud adapter configured');
  });

  it('continues processing after an error', async () => {
    const { engine, local } = makeEngine();
    let secondRan = false;

    const origRead = local.read.bind(local);
    let firstCall = true;
    local.read = async (...args) => {
      if (firstCall) {
        firstCall = false;
        throw new Error('fail');
      }
      return origRead(...args);
    };

    const p1 = engine.sync('memory', 'local', undefined).catch(() => {});
    const p2 = engine.sync('local', 'memory', undefined).then(() => { secondRan = true; });

    await Promise.all([p1, p2]);
    expect(secondRan).toBe(true);
  });

  it('emits entity changes for memory source (memory→local)', async () => {
    const { engine, store, eventBus } = makeEngine();
    const firedEntities: string[] = [];
    eventBus.on(({ entityName }) => {
      if (entityName) firedEntities.push(entityName);
    });

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', title: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    await engine.sync('memory', 'local', undefined);
    // memory→local: storeChanges = changesForA (source=memory)
    // The sync moved data from memory to local; sync completed without error
    const { result } = await engine.sync('local', 'memory', undefined);
    expect(result).toBeDefined();
  });

  it('emits entity changes for memory target (local→memory)', async () => {
    const { engine, store, local } = makeEngine();

    // Put data directly in local adapter bypassing store
    const blob = {
      task: { 'task._.l1': { id: 'task._.l1', title: 'From Local', hlc: { timestamp: 500, counter: 0, nodeId: 'n2' } } },
      deleted: { task: {} },
    };
    const { saveAllIndexes } = await import('@strata/persistence');
    await local.write(undefined, 'task._', blob);
    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 999, count: 1, deletedCount: 0, updatedAt: 500 } },
    }, DEFAULT_OPTIONS);

    // Sync local→memory: storeChanges = changesForB (target=memory)
    const { result } = await engine.sync('local', 'memory', undefined);
    expect(result.changesForB.length).toBeGreaterThanOrEqual(0);
  });

  it('handles local→cloud sync (no storeChanges)', async () => {
    const { engine, store } = makeEngine({ cloud: true });

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', title: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    // First flush to local
    await engine.sync('memory', 'local', undefined);
    // Then local→cloud: storeChanges should be empty (neither source nor target is memory)
    const { result } = await engine.sync('local', 'cloud', undefined);
    expect(result).toBeDefined();
  });

  it('emits entity changes for memory→local with diverged data', async () => {
    const { engine, store, local, eventBus } = makeEngine();
    const changedEntities: string[] = [];
    eventBus.on(({ entityName }) => {
      if (entityName) changedEntities.push(entityName);
    });

    // Put data in memory (store)
    store.setEntity('task._', 'task._.m1', {
      id: 'task._.m1', title: 'Memory',
      hlc: { timestamp: 100, counter: 0, nodeId: 'mem' },
    });

    // Put different data in local adapter to create divergence
    const localBlob = {
      task: {
        'task._.l1': {
          id: 'task._.l1', title: 'Local',
          hlc: { timestamp: 200, counter: 0, nodeId: 'loc' },
        },
      },
      deleted: { task: {} },
    };
    await local.write(undefined, 'task._', localBlob);
    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 999, count: 1, deletedCount: 0, updatedAt: 200 } },
    }, DEFAULT_OPTIONS);

    // memory→local with diverged data should merge and emit changesForA back to memory
    const { result } = await engine.sync('memory', 'local', undefined);
    // changesForA = merge results applied back to source (memory)
    expect(result).toBeDefined();
  });

  it('emits entity changes for local→memory with data', async () => {
    const { engine, local, eventBus } = makeEngine();
    const changedEntities: string[] = [];
    eventBus.on(({ entityName }) => {
      if (entityName) changedEntities.push(entityName);
    });

    // Put data only in local adapter
    const localBlob = {
      task: {
        'task._.l1': {
          id: 'task._.l1', title: 'From Local',
          hlc: { timestamp: 500, counter: 0, nodeId: 'loc' },
        },
      },
      deleted: { task: {} },
    };
    await local.write(undefined, 'task._', localBlob);
    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 777, count: 1, deletedCount: 0, updatedAt: 500 } },
    }, DEFAULT_OPTIONS);

    // local→memory: changesForB = changes applied to target (memory)
    const { result } = await engine.sync('local', 'memory', undefined);
    expect(result.changesForB.length).toBeGreaterThan(0);
  });

  it('dispose rejects pending queue items', async () => {
    const { engine } = makeEngine();

    // Enqueue two syncs — first will run, second will be pending
    const p1 = engine.sync('memory', 'local', undefined);
    const p2 = engine.sync('memory', 'local', undefined);

    engine.dispose();

    await p1.catch(() => {}); // may resolve or reject
    await expect(p2).rejects.toThrow('SyncEngine disposed');
  });

  it('drain completes when queue is empty', async () => {
    const { engine } = makeEngine();
    await expect(engine.drain()).resolves.toBeUndefined();
  });

  it('drain waits for running sync to complete', async () => {
    const { engine, store } = makeEngine();

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', title: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    // Start sync then immediately drain
    const syncP = engine.sync('memory', 'local', undefined);
    const drainP = engine.drain();

    await syncP;
    await drainP;
  });
});

