import debug from 'debug';
import type { Tenant } from '@strata/adapter';
import type { SyncScheduler as SyncSchedulerType, SyncSchedulerOptions, SyncEngine, DirtyTracker } from './types';

const log = debug('strata:sync');

export class SyncScheduler {
  private localTimer: ReturnType<typeof setInterval> | null = null;
  private cloudTimer: ReturnType<typeof setInterval> | null = null;
  private readonly localFlushIntervalMs: number;
  private readonly cloudSyncIntervalMs: number;
  private readonly dirtyTracker: DirtyTracker | undefined;

  constructor(
    private readonly engine: SyncEngine,
    private readonly tenant: Tenant | undefined,
    private readonly hasCloud: boolean,
    options?: SyncSchedulerOptions,
  ) {
    this.localFlushIntervalMs = options?.localFlushIntervalMs ?? 2000;
    this.cloudSyncIntervalMs = options?.cloudSyncIntervalMs ?? 300000;
    this.dirtyTracker = options?.dirtyTracker;
  }

  start(): void {
    this.localTimer = setInterval(() => {
      this.engine.sync('memory', 'local', this.tenant).catch((err: unknown) => {
        log.extend('error')('local flush failed: %O', err);
      });
    }, this.localFlushIntervalMs);

    if (this.hasCloud) {
      this.cloudTimer = setInterval(() => {
        (async () => {
          try {
            await this.engine.sync('local', 'cloud', this.tenant);
            await this.engine.sync('local', 'memory', this.tenant);
            this.dirtyTracker?.clearDirty();
          } catch (err) {
            log.extend('error')('cloud sync failed: %O', err);
          }
        })();
      }, this.cloudSyncIntervalMs);
    }

    log('scheduler started (local=%dms, cloud=%dms)', this.localFlushIntervalMs, this.cloudSyncIntervalMs);
  }

  stop(): void {
    if (this.localTimer !== null) {
      clearInterval(this.localTimer);
      this.localTimer = null;
    }
    if (this.cloudTimer !== null) {
      clearInterval(this.cloudTimer);
      this.cloudTimer = null;
    }
    log('scheduler stopped');
  }
}
