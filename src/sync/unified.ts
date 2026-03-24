import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import { loadAllIndexes, saveAllIndexes } from '@strata/persistence';
import type { EntityStore } from '@strata/store';
import { loadPartitionFromAdapter } from '@strata/store';
import { diffPartitions } from './diff';
import { syncCopyPhase } from './copy';
import { syncMergePhase, updateIndexesAfterSync } from './sync-phase';

const log = debug('strata:sync');

export type SyncBetweenResult = {
  readonly hydratedEntityNames: ReadonlyArray<string>;
  readonly partitionsCopied: number;
  readonly partitionsMerged: number;
  readonly conflictsResolved: number;
};

export async function syncBetween(
  adapterA: BlobAdapter,
  adapterB: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  meta: Meta,
): Promise<SyncBetweenResult> {
  const [indexesA, indexesB] = await Promise.all([
    loadAllIndexes(adapterA, meta),
    loadAllIndexes(adapterB, meta),
  ]);

  const hydratedEntityNames: string[] = [];
  let totalCopied = 0;
  let totalMerged = 0;
  let totalConflicts = 0;
  let indexChanged = false;

  for (const entityName of entityNames) {
    const indexA = indexesA[entityName] ?? {};
    const indexB = indexesB[entityName] ?? {};
    const diff = diffPartitions(indexA, indexB);

    const copiedKeys = await syncCopyPhase(
      adapterA, adapterB, meta, entityName, diff,
    );
    totalCopied += copiedKeys.length;

    const mergedResults = await syncMergePhase(
      adapterA, adapterB, meta, entityName, diff.diverged,
    );
    totalMerged += mergedResults.length;

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
      totalConflicts += Object.keys(entities).length;
    }

    // Load B-only (newly copied) partitions into store
    for (const partitionKey of diff.cloudOnly) {
      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(adapterA, meta, store, entityName, partitionKey),
      );
    }

    // Load A-only partitions into store (in case they aren't loaded yet)
    for (const partitionKey of diff.localOnly) {
      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(adapterA, meta, store, entityName, partitionKey),
      );
    }

    const allSynced = [
      ...copiedKeys,
      ...mergedResults.map(r => r.partitionKey),
    ];

    if (allSynced.length > 0) {
      const { updatedLocal, updatedCloud } = await updateIndexesAfterSync(
        adapterA, meta, entityName,
        indexA, indexB, allSynced,
      );
      indexesA[entityName] = updatedLocal;
      indexesB[entityName] = updatedCloud;
      indexChanged = true;
    }

    hydratedEntityNames.push(entityName);
    log('syncBetween processed %s: %d copied, %d merged', entityName, copiedKeys.length, mergedResults.length);
  }

  if (indexChanged) {
    await Promise.all([
      saveAllIndexes(adapterA, meta, indexesA),
      saveAllIndexes(adapterB, meta, indexesB),
    ]);
  }

  return {
    hydratedEntityNames,
    partitionsCopied: totalCopied,
    partitionsMerged: totalMerged,
    conflictsResolved: totalConflicts,
  };
}
