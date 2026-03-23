import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import type { EntityStore, FlushScheduler, FlushSchedulerOptions } from './types';
import { flushAll } from './flush';

const log = debug('strata:store');

export function createFlushScheduler(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  store: EntityStore,
  options?: FlushSchedulerOptions,
): FlushScheduler {
  const debounceMs = options?.debounceMs ?? 2000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  return {
    schedule() {
      if (disposed) return;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        flushAll(adapter, cloudMeta, store).catch((err: unknown) => {
          log.extend('error')('flush failed: %O', err);
        });
      }, debounceMs);
    },

    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await flushAll(adapter, cloudMeta, store);
    },

    async dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await flushAll(adapter, cloudMeta, store);
    },
  };
}
