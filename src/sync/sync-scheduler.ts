import type { SyncScheduler } from './types.js';

export function createSyncScheduler(): SyncScheduler {
  let current: Promise<void> | null = null;
  let pending: {
    fn: () => Promise<void>;
    resolve: () => void;
    reject: (err: unknown) => void;
    promise: Promise<void>;
  } | null = null;
  let disposed = false;

  function drainQueue(): void {
    if (!pending || disposed) return;
    const { fn, resolve, reject } = pending;
    pending = null;
    current = fn().then(resolve, reject).finally(() => {
      current = null;
      drainQueue();
    });
  }

  const schedule = (fn: () => Promise<void>): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (!current) {
      current = fn().finally(() => {
        current = null;
        drainQueue();
      });
      return current;
    }
    if (pending) {
      pending.fn = fn;
      return pending.promise;
    }
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    pending = { fn, resolve, reject, promise };
    return promise;
  };

  const dispose = (): void => {
    disposed = true;
    if (pending) {
      pending.resolve();
      pending = null;
    }
  };

  return { schedule, dispose };
}
