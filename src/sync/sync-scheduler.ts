import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import type { EntityStore } from '@strata/store';
import { flushAll, loadPartitionFromAdapter } from '@strata/store';
import type { SyncLock, SyncScheduler, SyncSchedulerOptions } from './types';
import { loadIndexPair, diffPartitions } from './diff';
import { syncCopyPhase } from './copy';
import { syncMergePhase, updateIndexesAfterSync } from './sync-phase';

const log = debug('strata:sync');

export function createSyncScheduler(
  syncLock: SyncLock,
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  cloudMeta: CloudMeta,
  options?: SyncSchedulerOptions,
): SyncScheduler {
  const localFlushIntervalMs = options?.localFlushIntervalMs ?? 2000;
  const cloudSyncIntervalMs = options?.cloudSyncIntervalMs ?? 300000;

  let localTimer: ReturnType<typeof setInterval> | null = null;
  let cloudTimer: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      localTimer = setInterval(() => {
        syncLock.enqueue('memory-to-local', 'memory-to-local', () =>
          flushAll(localAdapter, undefined, store),
        ).catch((err: unknown) => {
          log.extend('error')('local flush failed: %O', err);
        });
      }, localFlushIntervalMs);

      cloudTimer = setInterval(() => {
        syncLock.enqueue('local-to-cloud', 'local-to-cloud', () =>
          syncCloudCycle(localAdapter, cloudAdapter, store, entityNames, cloudMeta),
        ).catch((err: unknown) => {
          log.extend('error')('cloud sync failed: %O', err);
        });
      }, cloudSyncIntervalMs);

      log('scheduler started (local=%dms, cloud=%dms)', localFlushIntervalMs, cloudSyncIntervalMs);
    },

    stop() {
      if (localTimer !== null) {
        clearInterval(localTimer);
        localTimer = null;
      }
      if (cloudTimer !== null) {
        clearInterval(cloudTimer);
        cloudTimer = null;
      }
      log('scheduler stopped');
    },

    async dispose() {
      this.stop();
      await syncLock.drain();
      syncLock.dispose();
      log('scheduler disposed');
    },
  };
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
