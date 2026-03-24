import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import type { EntityStore } from '@strata/store';
import { flushAll, loadPartitionFromAdapter } from '@strata/store';
import type { SyncLock, SyncScheduler as SyncSchedulerType, SyncSchedulerOptions } from './types';
import { loadIndexPair, diffPartitions } from './diff';
import { syncCopyPhase } from './copy';
import { syncMergePhase, updateIndexesAfterSync } from './sync-phase';

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
    private readonly cloudMeta: CloudMeta,
    options?: SyncSchedulerOptions,
  ) {
    this.localFlushIntervalMs = options?.localFlushIntervalMs ?? 2000;
    this.cloudSyncIntervalMs = options?.cloudSyncIntervalMs ?? 300000;
  }

  start(): void {
    this.localTimer = setInterval(() => {
      this.syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
        flushAll(this.localAdapter, undefined, this.store),
      ).catch((err: unknown) => {
        log.extend('error')('local flush failed: %O', err);
      });
    }, this.localFlushIntervalMs);

    this.cloudTimer = setInterval(() => {
      this.syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
        syncCloudCycle(this.localAdapter, this.cloudAdapter, this.store, this.entityNames, this.cloudMeta),
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
  cloudMeta: CloudMeta,
  options?: SyncSchedulerOptions,
): SyncSchedulerType {
  return new SyncScheduler(syncLock, localAdapter, cloudAdapter, store, entityNames, cloudMeta, options);
}

async function syncCloudCycle(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  cloudMeta: CloudMeta,
): Promise<void> {
  for (const entityName of entityNames) {
    const { localIndex, cloudIndex } = await loadIndexPair(
      localAdapter, cloudAdapter, cloudMeta, entityName,
    );
    const diff = diffPartitions(localIndex, cloudIndex);

    const copiedKeys = await syncCopyPhase(
      localAdapter, cloudAdapter, cloudMeta, entityName, diff,
    );

    const mergedResults = await syncMergePhase(
      localAdapter, cloudAdapter, cloudMeta, entityName, diff.diverged,
    );

    // Apply merged entities/tombstones to in-memory store
    for (const { partitionKey, entities, tombstones } of mergedResults) {
      const entityKey = partitionBlobKey(entityName, partitionKey);
      for (const [id, entity] of Object.entries(entities)) {
        store.set(entityKey, id, entity);
      }
      for (const [id, hlc] of Object.entries(tombstones)) {
        store.delete(entityKey, id);
        store.setTombstone(entityKey, id, hlc as Hlc);
      }
      store.clearDirty(entityKey);
    }

    // Load cloud-only partitions into store
    for (const partitionKey of diff.cloudOnly) {
      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(localAdapter, undefined, store, entityName, partitionKey),
      );
    }

    const allSynced = [
      ...copiedKeys,
      ...mergedResults.map(r => r.partitionKey),
    ];

    if (allSynced.length > 0) {
      await updateIndexesAfterSync(
        localAdapter, cloudAdapter, cloudMeta, entityName,
        localIndex, cloudIndex, allSynced,
      );
    }
  }
}

export async function syncNow(
  syncLock: SyncLock,
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  cloudMeta: CloudMeta,
): Promise<void> {
  await syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
    flushAll(localAdapter, undefined, store),
  );

  await syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
    syncCloudCycle(localAdapter, cloudAdapter, store, entityNames, cloudMeta),
  );
}
