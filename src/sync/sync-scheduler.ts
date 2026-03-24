import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import type { EntityStore } from '@strata/store';
import { flushAll, loadPartitionFromAdapter } from '@strata/store';
import { loadAllIndexes, saveAllIndexes } from '@strata/persistence';
import type { SyncLock, SyncScheduler as SyncSchedulerType, SyncSchedulerOptions } from './types';
import { diffPartitions } from './diff';
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
    private readonly meta: Meta,
    options?: SyncSchedulerOptions,
  ) {
    this.localFlushIntervalMs = options?.localFlushIntervalMs ?? 2000;
    this.cloudSyncIntervalMs = options?.cloudSyncIntervalMs ?? 300000;
  }

  start(): void {
    this.localTimer = setInterval(() => {
      this.syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
        flushAll(this.localAdapter, this.meta, this.store),
      ).catch((err: unknown) => {
        log.extend('error')('local flush failed: %O', err);
      });
    }, this.localFlushIntervalMs);

    this.cloudTimer = setInterval(() => {
      this.syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
        syncCloudCycle(this.localAdapter, this.cloudAdapter, this.store, this.entityNames, this.meta),
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
  meta: Meta,
  options?: SyncSchedulerOptions,
): SyncSchedulerType {
  return new SyncScheduler(syncLock, localAdapter, cloudAdapter, store, entityNames, meta, options);
}

async function syncCloudCycle(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  meta: Meta,
): Promise<void> {
  const [localIndexes, cloudIndexes] = await Promise.all([
    loadAllIndexes(localAdapter, meta),
    loadAllIndexes(cloudAdapter, meta),
  ]);
  let indexChanged = false;

  for (const entityName of entityNames) {
    const localIndex = localIndexes[entityName] ?? {};
    const cloudIndex = cloudIndexes[entityName] ?? {};
    const diff = diffPartitions(localIndex, cloudIndex);

    const copiedKeys = await syncCopyPhase(
      localAdapter, cloudAdapter, meta, entityName, diff,
    );

    const mergedResults = await syncMergePhase(
      localAdapter, cloudAdapter, meta, entityName, diff.diverged,
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
        loadPartitionFromAdapter(localAdapter, meta, store, entityName, partitionKey),
      );
    }

    const allSynced = [
      ...copiedKeys,
      ...mergedResults.map(r => r.partitionKey),
    ];

    if (allSynced.length > 0) {
      const { updatedLocal, updatedCloud } = await updateIndexesAfterSync(
        localAdapter, meta, entityName,
        localIndex, cloudIndex, allSynced,
      );
      localIndexes[entityName] = updatedLocal;
      cloudIndexes[entityName] = updatedCloud;
      indexChanged = true;
    }
  }

  if (indexChanged) {
    await Promise.all([
      saveAllIndexes(localAdapter, meta, localIndexes),
      saveAllIndexes(cloudAdapter, meta, cloudIndexes),
    ]);
  }
}

export async function syncNow(
  syncLock: SyncLock,
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  meta: Meta,
): Promise<void> {
  await syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
    flushAll(localAdapter, meta, store),
  );

  await syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
    syncCloudCycle(localAdapter, cloudAdapter, store, entityNames, meta),
  );
}
