import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDataAdapter } from '../helpers';
import { createHlc } from '@strata/hlc';
import { EventBus } from '@strata/reactive';
import { saveAllIndexes } from '@strata/persistence';
import { Store } from '@strata/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { SyncEngine, SyncScheduler } from '@strata/sync';

function makePartitionBlob(entityName: string, entities: Record<string, unknown>, tombstones: Record<string, unknown> = {}): Record<string, unknown> {
  return ({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

function makeEngine(opts?: { cloud?: boolean }) {
  const store = new Store(DEFAULT_OPTIONS);
  const local = createDataAdapter();
  const cloud = opts?.cloud !== false ? createDataAdapter() : undefined;
  const hlcRef = { current: createHlc('test') };
  const eventBus = new EventBus();
  const engine = new SyncEngine(store, local, cloud, ['task'], hlcRef, eventBus);
  return { engine, store, local, cloud };
}

describe('SyncScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start begins periodic timers', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();

    const scheduler = new SyncScheduler(
      engine, undefined, true,
      { localFlushIntervalMs: 100, cloudSyncIntervalMs: 500 },
    );

    scheduler.start();
    scheduler.stop();
  });

  it('stop clears timers', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    const scheduler = new SyncScheduler(
      engine, undefined, true,
      { localFlushIntervalMs: 100, cloudSyncIntervalMs: 500 },
    );

    scheduler.start();
    scheduler.stop();

    vi.advanceTimersByTime(1000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });
});

describe('SyncScheduler — timer callbacks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('local flush interval calls sync memory→local on tick', async () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    const scheduler = new SyncScheduler(
      engine, undefined, true,
      { localFlushIntervalMs: 50, cloudSyncIntervalMs: 100000 },
    );

    scheduler.start();
    vi.advanceTimersByTime(50);

    expect(syncSpy).toHaveBeenCalledWith('memory', 'local', undefined);

    scheduler.stop();
    syncSpy.mockRestore();
  });

  it('cloud sync interval calls sync local→cloud on tick', async () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    const scheduler = new SyncScheduler(
      engine, undefined, true,
      { localFlushIntervalMs: 100000, cloudSyncIntervalMs: 50 },
    );

    scheduler.start();
    vi.advanceTimersByTime(50);

    expect(syncSpy).toHaveBeenCalledWith('local', 'cloud', undefined);

    scheduler.stop();
    syncSpy.mockRestore();
  });

  it('catches local flush errors without crashing', async () => {
    const { engine, local } = makeEngine();
    local.read = async () => { throw new Error('write failed'); };

    const scheduler = new SyncScheduler(
      engine, undefined, true,
      { localFlushIntervalMs: 20, cloudSyncIntervalMs: 100000 },
    );

    scheduler.start();
    await new Promise(r => setTimeout(r, 100));
    await engine.drain().catch(() => {});
    scheduler.stop();
  });

  it('catches cloud sync errors without crashing', async () => {
    const { engine, cloud } = makeEngine();
    cloud!.read = async () => { throw new Error('network failed'); };

    const scheduler = new SyncScheduler(
      engine, undefined, true,
      { localFlushIntervalMs: 100000, cloudSyncIntervalMs: 20 },
    );

    scheduler.start();
    await new Promise(r => setTimeout(r, 100));
    await engine.drain().catch(() => {});
    scheduler.stop();
  });

  it('does not start cloud timer when hasCloud is false', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine({ cloud: false });
    const syncSpy = vi.spyOn(engine, 'sync');

    const scheduler = new SyncScheduler(
      engine, undefined, false,
      { localFlushIntervalMs: 50, cloudSyncIntervalMs: 50 },
    );

    scheduler.start();
    vi.advanceTimersByTime(100);

    const calls = syncSpy.mock.calls;
    expect(calls.every(c => c[0] === 'memory' && c[1] === 'local')).toBe(true);

    scheduler.stop();
    syncSpy.mockRestore();
  });

  it('stop is safe when no cloud timer was started', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine({ cloud: false });

    const scheduler = new SyncScheduler(
      engine, undefined, false,
      { localFlushIntervalMs: 50, cloudSyncIntervalMs: 50 },
    );

    scheduler.start();
    // cloudTimer is null because hasCloud=false
    expect(() => scheduler.stop()).not.toThrow();
  });
});

