import debug from 'debug';
import type { SyncDirection, SyncLock, SyncQueueItem } from './types';

const log = debug('strata:sync');

export function createSyncLock(): SyncLock {
  const queue: SyncQueueItem[] = [];
  let running = false;
  let disposed = false;

  async function processQueue(): Promise<void> {
    if (running) return;
    running = true;

    while (queue.length > 0) {
      const item = queue[0];
      try {
        await item.fn();
        item.resolve();
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
      queue.shift();
    }

    running = false;
  }

  return {
    enqueue(source, target, fn) {
      if (disposed) {
        return Promise.reject(new Error('SyncLock is disposed'));
      }

      const existing = queue.find(
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

      queue.push({ source, target, fn, promise, resolve, reject });
      log('enqueued %s→%s', source, target);
      processQueue();

      return promise;
    },

    isRunning() {
      return running;
    },

    async drain() {
      while (queue.length > 0 || running) {
        await queue[queue.length - 1]?.promise.catch(() => {});
        if (running && queue.length === 0) {
          await new Promise<void>(r => setTimeout(r, 0));
        }
      }
    },

    dispose() {
      disposed = true;
      for (const item of queue) {
        item.reject(new Error('SyncLock disposed'));
      }
      queue.length = 0;
    },
  };
}
