import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import type { EntityStore } from '@strata/store';
import type { SyncLock, SyncScheduler as SyncSchedulerType, SyncSchedulerOptions, SyncResult, DirtyTracker, SyncEventEmitter } from './types';
import { syncBetween } from './unified';

const log = debug('strata:sync');

export class SyncScheduler {
  private localTimer: ReturnType<typeof setInterval> | null = null;
  private cloudTimer: ReturnType<typeof setInterval> | null = null;
  private readonly localFlushIntervalMs: number;
  private readonly cloudSyncIntervalMs: number;
  private readonly dirtyTracker: DirtyTracker | undefined;
  private readonly syncEvents: SyncEventEmitter | undefined;

  constructor(
    private readonly syncLock: SyncLock,
    private readonly localAdapter: BlobAdapter,
    private readonly cloudAdapter: BlobAdapter,
    private readonly store: EntityStore,
    private readonly entityNames: ReadonlyArray<string>,
    private readonly tenant: Tenant | undefined,
    options?: SyncSchedulerOptions,
  ) {
    this.localFlushIntervalMs = options?.localFlushIntervalMs ?? 2000;
    this.cloudSyncIntervalMs = options?.cloudSyncIntervalMs ?? 300000;
    this.dirtyTracker = options?.dirtyTracker;
    this.syncEvents = options?.syncEvents;
  }

  start(): void {
    this.localTimer = setInterval(() => {
      this.syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
        flushToLocal(this.store, this.localAdapter, this.entityNames, this.tenant),
      ).catch((err: unknown) => {
        log.extend('error')('local flush failed: %O', err);
      });
    }, this.localFlushIntervalMs);

    this.cloudTimer = setInterval(() => {
      this.syncLock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
        this.syncEvents?.emit({ type: 'sync-started' });
        try {
          const result = await syncBetween(
            this.localAdapter, this.cloudAdapter,
            this.store, this.entityNames, this.tenant,
          );
          this.dirtyTracker?.clearDirty();
          this.syncEvents?.emit({
            type: 'sync-completed',
            result: {
              entitiesUpdated: result.partitionsCopied,
              conflictsResolved: result.conflictsResolved,
              partitionsSynced: result.partitionsCopied + result.partitionsMerged,
            },
          });
          log('cloud sync cycle complete: %d copied, %d merged', result.partitionsCopied, result.partitionsMerged);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.syncEvents?.emit({ type: 'sync-failed', error });
          throw err;
        }
      }).catch((err: unknown) => {
        log.extend('error')('cloud sync failed: %O', err);
      });
    }, this.cloudSyncIntervalMs);

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

  async dispose(): Promise<void> {
    this.stop();
    await this.syncLock.drain();
    this.syncLock.dispose();
    log('scheduler disposed');
  }
}

export function createSyncScheduler(
  syncLock: SyncLock,
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
  options?: SyncSchedulerOptions,
): SyncSchedulerType {
  return new SyncScheduler(syncLock, localAdapter, cloudAdapter, store, entityNames, tenant, options);
}

async function flushToLocal(
  store: EntityStore,
  localAdapter: BlobAdapter,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
): Promise<void> {
  const result = await syncBetween(store, localAdapter, store, entityNames, tenant);
  log('memory→local flush complete: %d copied, %d merged', result.partitionsCopied, result.partitionsMerged);
}

export async function syncNow(
  syncLock: SyncLock,
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
): Promise<SyncResult> {
  await syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
    flushToLocal(store, localAdapter, entityNames, tenant),
  );

  let syncResult: SyncResult = {
    entitiesUpdated: 0,
    conflictsResolved: 0,
    partitionsSynced: 0,
  };

  await syncLock.enqueue('local-to-cloud', 'local-to-cloud', async () => {
    const result = await syncBetween(localAdapter, cloudAdapter, store, entityNames, tenant);
    syncResult = {
      entitiesUpdated: result.partitionsCopied,
      conflictsResolved: result.conflictsResolved,
      partitionsSynced: result.partitionsCopied + result.partitionsMerged,
    };
  });

  return syncResult;
}
