import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import type { EntityStore } from '@strata/store';
import type { SyncLock, SyncScheduler as SyncSchedulerType, SyncSchedulerOptions } from './types';
import { syncBetween } from './unified';

const log = debug('strata:sync');

export class SyncScheduler {
  private localTimer: ReturnType<typeof setInterval> | null = null;
  private cloudTimer: ReturnType<typeof setInterval> | null = null;
  private readonly localFlushIntervalMs: number;
  private readonly cloudSyncIntervalMs: number;

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
  }

  start(): void {
    this.localTimer = setInterval(() => {
      this.syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
        syncMemoryToLocal(this.store, this.localAdapter, this.entityNames, this.tenant),
      ).catch((err: unknown) => {
        log.extend('error')('local flush failed: %O', err);
      });
    }, this.localFlushIntervalMs);

    this.cloudTimer = setInterval(() => {
      this.syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
        syncCloudCycle(this.localAdapter, this.cloudAdapter, this.store, this.entityNames, this.tenant),
      ).catch((err: unknown) => {
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

async function syncMemoryToLocal(
  store: EntityStore,
  localAdapter: BlobAdapter,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
): Promise<void> {
  const result = await syncBetween(store, localAdapter, store, entityNames, tenant);
  log('memory→local sync complete: %d copied, %d merged', result.partitionsCopied, result.partitionsMerged);
}

async function syncCloudCycle(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
): Promise<void> {
  const result = await syncBetween(localAdapter, cloudAdapter, store, entityNames, tenant);
  log('cloud sync cycle complete: %d copied, %d merged', result.partitionsCopied, result.partitionsMerged);
}

export async function syncNow(
  syncLock: SyncLock,
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
): Promise<void> {
  await syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
    syncMemoryToLocal(store, localAdapter, entityNames, tenant),
  );

  await syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
    syncCloudCycle(localAdapter, cloudAdapter, store, entityNames, tenant),
  );
}
