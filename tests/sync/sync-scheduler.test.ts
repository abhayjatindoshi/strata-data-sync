import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDataAdapter } from '../helpers';
import { createHlc } from '@strata/hlc';
import { EventBus } from '@strata/reactive';
import { Store } from '@strata/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { SyncEngine } from '@strata/sync';

function makeEngine(opts?: { cloud?: boolean }) {
  const store = new Store(DEFAULT_OPTIONS);
  const local = createDataAdapter();
  const cloud = opts?.cloud !== false ? createDataAdapter() : undefined;
  const hlcRef = { current: createHlc('test') };
  const eventBus = new EventBus();
  const engine = new SyncEngine(store, local, cloud, ['task'], hlcRef, eventBus, undefined, DEFAULT_OPTIONS);
  return { engine, store, local, cloud };
}

describe('SyncEngine scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('startScheduler begins periodic timers', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    engine.startScheduler(undefined, true);
    engine.stopScheduler();
  });

  it('stopScheduler clears timers', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    engine.stopScheduler();

    vi.advanceTimersByTime(10000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('local flush interval calls sync memory→local on tick', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    vi.advanceTimersByTime(2000);

    expect(syncSpy).toHaveBeenCalledWith('memory', 'local', undefined);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('does not start cloud timer when hasCloud is false', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine({ cloud: false });
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, false);
    vi.advanceTimersByTime(10000);

    const calls = syncSpy.mock.calls;
    expect(calls.every(c => c[0] === 'memory' && c[1] === 'local')).toBe(true);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('stopScheduler is safe to call multiple times', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine({ cloud: false });

    engine.startScheduler(undefined, false);
    expect(() => {
      engine.stopScheduler();
      engine.stopScheduler();
    }).not.toThrow();
  });

  it('dispose stops scheduler', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    engine.dispose();

    vi.advanceTimersByTime(10000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('catches local flush errors without crashing', async () => {
    const { engine, local } = makeEngine();
    local.read = async () => { throw new Error('write failed'); };

    engine.startScheduler(undefined, true);
    await new Promise(r => setTimeout(r, 3000));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });

  it('catches cloud sync errors without crashing', async () => {
    const { engine, cloud } = makeEngine();
    cloud!.read = async () => { throw new Error('network failed'); };

    engine.startScheduler(undefined, true);
    await new Promise(r => setTimeout(r, 3000));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });
});

describe('SyncEngine.run()', () => {
  it('executes steps in order', async () => {
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    await engine.run(undefined, [['memory', 'local'], ['local', 'memory']]);

    expect(syncSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy.mock.calls[0]?.[0]).toBe('memory');
    expect(syncSpy.mock.calls[0]?.[1]).toBe('local');
    expect(syncSpy.mock.calls[1]?.[0]).toBe('local');
    expect(syncSpy.mock.calls[1]?.[1]).toBe('memory');

    syncSpy.mockRestore();
  });

  it('returns results for each step', async () => {
    const { engine } = makeEngine();
    const results = await engine.run(undefined, [['memory', 'local']]);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty('changesForA');
    expect(results[0]).toHaveProperty('changesForB');
  });

  it('returns empty array for empty steps', async () => {
    const { engine } = makeEngine();
    const results = await engine.run(undefined, []);
    expect(results).toEqual([]);
  });
});

