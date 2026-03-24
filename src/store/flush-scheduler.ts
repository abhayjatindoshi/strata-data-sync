import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import type { EntityStore, FlushScheduler as FlushSchedulerType, FlushSchedulerOptions } from './types';
import { flushAll } from './flush';

const log = debug('strata:store');

export class FlushScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly debounceMs: number;

  constructor(
    private readonly adapter: BlobAdapter,
    private readonly cloudMeta: CloudMeta,
    private readonly store: EntityStore,
    options?: FlushSchedulerOptions,
  ) {
    this.debounceMs = options?.debounceMs ?? 2000;
  }

  schedule(): void {
    if (this.disposed) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      flushAll(this.adapter, this.cloudMeta, this.store).catch((err: unknown) => {
        log.extend('error')('flush failed: %O', err);
      });
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await flushAll(this.adapter, this.cloudMeta, this.store);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await flushAll(this.adapter, this.cloudMeta, this.store);
  }
}

export function createFlushScheduler(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  store: EntityStore,
  options?: FlushSchedulerOptions,
): FlushSchedulerType {
  return new FlushScheduler(adapter, cloudMeta, store, options);
}
