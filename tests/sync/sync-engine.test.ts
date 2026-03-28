import { describe, it, expect } from 'vitest';
import { SyncEngine } from '@strata/sync';
import type { SyncEvent } from '@strata/sync';
import { MemoryBlobAdapter } from '@strata/adapter';
import { createHlc } from '@strata/hlc';
import { EventBus } from '@strata/reactive';
import { Store } from '@strata/store';

function makeEngine(opts?: { cloud?: boolean }) {
  const store = new Store();
  const local = new MemoryBlobAdapter();
  const cloud = opts?.cloud ? new MemoryBlobAdapter() : undefined;
  const hlcRef = { current: createHlc('test') };
  const eventBus = new EventBus();
  const engine = new SyncEngine(store, local, cloud, ['task'], hlcRef, eventBus);
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
});
