import { describe, it, expect } from 'vitest';
import { createSyncLock } from '@strata/sync';

describe('createSyncLock', () => {
  it('executes enqueued operations sequentially', async () => {
    const lock = createSyncLock();
    const order: number[] = [];

    const p1 = lock.enqueue('memory-to-local', 'memory-to-local', async () => {
      await delay(10);
      order.push(1);
    });

    const p2 = lock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('deduplicates when same source+target is already queued', async () => {
    const lock = createSyncLock();
    let callCount = 0;

    const p1 = lock.enqueue('memory-to-local', 'memory-to-local', async () => {
      await delay(20);
      callCount++;
    });

    const p2 = lock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
      callCount++;
    });

    const p3 = lock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
      callCount++;
    });

    expect(p2).toBe(p3);
    await Promise.all([p1, p2]);
    expect(callCount).toBe(2);
  });

  it('isRunning returns true while processing queue', async () => {
    const lock = createSyncLock();

    let runningDuringExec = false;
    const p = lock.enqueue('memory-to-local', 'memory-to-local', async () => {
      runningDuringExec = lock.isRunning();
    });

    await p;
    expect(runningDuringExec).toBe(true);
    expect(lock.isRunning()).toBe(false);
  });

  it('drain waits for all queued operations', async () => {
    const lock = createSyncLock();
    const results: number[] = [];

    lock.enqueue('memory-to-local', 'memory-to-local', async () => {
      await delay(10);
      results.push(1);
    });

    lock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
      results.push(2);
    });

    await lock.drain();
    expect(results).toEqual([1, 2]);
  });

  it('dispose rejects further enqueue calls', async () => {
    const lock = createSyncLock();
    lock.dispose();

    await expect(
      lock.enqueue('memory-to-local', 'memory-to-local', async () => {}),
    ).rejects.toThrow('disposed');
  });

  it('propagates errors from operations', async () => {
    const lock = createSyncLock();

    await expect(
      lock.enqueue('memory-to-local', 'memory-to-local', async () => {
        throw new Error('op failed');
      }),
    ).rejects.toThrow('op failed');
  });

  it('continues processing after an error', async () => {
    const lock = createSyncLock();
    let secondRan = false;

    const p1 = lock.enqueue('memory-to-local', 'memory-to-local', async () => {
      throw new Error('fail');
    });

    const p2 = lock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
      secondRan = true;
    });

    await p1.catch(() => {});
    await p2;
    expect(secondRan).toBe(true);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
