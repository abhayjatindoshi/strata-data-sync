import debug from 'debug';
import type { SyncDirection, SyncLock as SyncLockType, SyncQueueItem } from './types';

const log = debug('strata:sync');

export class SyncLock {
  private readonly queue: SyncQueueItem[] = [];
  private running = false;
  private disposed = false;

  private async processQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      try {
        await item.fn();
        item.resolve();
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
      this.queue.shift();
    }

    this.running = false;
  }

  enqueue(
    source: SyncDirection,
    target: SyncDirection,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('SyncLock is disposed'));
    }

    const existing = this.queue.find(
      item => item.source === source && item.target === target,
    );
    if (existing) {
      log('dedup: %s→%s already queued', source, target);
      return existing.promise;
    }

    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.queue.push({ source, target, fn, promise, resolve, reject });
    log('enqueued %s→%s', source, target);
    this.processQueue();

    return promise;
  }

  isRunning(): boolean {
    return this.running;
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running) {
      await this.queue[this.queue.length - 1]?.promise.catch(() => {});
      if (this.running && this.queue.length === 0) {
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const item of this.queue) {
      item.reject(new Error('SyncLock disposed'));
    }
    this.queue.length = 0;
  }
}

export function createSyncLock(): SyncLockType {
  return new SyncLock();
}
