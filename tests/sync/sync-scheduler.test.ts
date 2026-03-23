import { describe, it, expect } from 'vitest';
import { createSyncScheduler } from '@strata/sync/sync-scheduler.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

describe('createSyncScheduler', () => {
  it('runs a single task', async () => {
    const scheduler = createSyncScheduler();
    let ran = false;
    await scheduler.schedule(async () => { ran = true; });
    expect(ran).toBe(true);
  });

  it('runs tasks sequentially', async () => {
    const scheduler = createSyncScheduler();
    const order: number[] = [];
    const d = deferred();

    const t1 = scheduler.schedule(async () => {
      await d.promise;
      order.push(1);
    });
    const t2 = scheduler.schedule(async () => { order.push(2); });

    d.resolve();
    await t1;
    await t2;
    expect(order).toEqual([1, 2]);
  });

  it('concurrent callers receive same promise', () => {
    const scheduler = createSyncScheduler();
    const d = deferred();
    scheduler.schedule(async () => { await d.promise; });
    const p2 = scheduler.schedule(async () => {});
    const p3 = scheduler.schedule(async () => {});
    expect(p2).toBe(p3);
    d.resolve();
  });

  it('runs latest queued function (dedup)', async () => {
    const scheduler = createSyncScheduler();
    const d = deferred();
    const calls: string[] = [];

    scheduler.schedule(async () => {
      await d.promise;
      calls.push('first');
    });
    scheduler.schedule(async () => { calls.push('second'); });
    const p = scheduler.schedule(async () => { calls.push('third'); });

    d.resolve();
    await p;
    expect(calls).toEqual(['first', 'third']);
  });

  it('dispose prevents queued tasks from running', async () => {
    const scheduler = createSyncScheduler();
    const d = deferred();
    const calls: string[] = [];

    scheduler.schedule(async () => {
      await d.promise;
      calls.push('first');
    });
    const p = scheduler.schedule(async () => { calls.push('queued'); });

    scheduler.dispose();
    d.resolve();
    await p;
    expect(calls).toEqual(['first']);
  });

  it('dispose resolves pending promise', async () => {
    const scheduler = createSyncScheduler();
    const d = deferred();
    scheduler.schedule(async () => { await d.promise; });
    const p = scheduler.schedule(async () => {});
    scheduler.dispose();
    await p; // should resolve, not hang
    d.resolve();
  });

  it('schedule after dispose is a no-op', async () => {
    const scheduler = createSyncScheduler();
    scheduler.dispose();
    let ran = false;
    await scheduler.schedule(async () => { ran = true; });
    expect(ran).toBe(false);
  });
});
