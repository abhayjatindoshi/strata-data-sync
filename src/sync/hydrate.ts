import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { AllIndexes } from '@strata/persistence';
import { loadAllIndexes, saveAllIndexes } from '@strata/persistence';
import type { EntityStore } from '@strata/store';
import { loadPartitionFromAdapter } from '@strata/store';

const log = debug('strata:sync');

export async function hydrateFromCloud(
  cloudAdapter: BlobAdapter,
  localAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  meta: Meta,
): Promise<ReadonlyArray<string>> {
  const hydrated: string[] = [];
  const cloudIndexes = await loadAllIndexes(cloudAdapter, meta);
  const localIndexes = await loadAllIndexes(localAdapter, meta);
  let indexChanged = false;

  for (const entityName of entityNames) {
    const cloudIndex = cloudIndexes[entityName] ?? {};
    const partitionKeys = Object.keys(cloudIndex);

    for (const partitionKey of partitionKeys) {
      const blobKey = partitionBlobKey(entityName, partitionKey);
      const cloudData = await cloudAdapter.read(meta, blobKey);
      if (cloudData) {
        await localAdapter.write(meta, blobKey, cloudData);
      }

      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(localAdapter, meta, store, entityName, partitionKey),
      );
    }

    hydrated.push(entityName);
    log('hydrated %s from cloud (%d partitions)', entityName, partitionKeys.length);

    // Copy cloud partition index to local so subsequent syncs can diff correctly
    if (partitionKeys.length > 0) {
      localIndexes[entityName] = cloudIndex;
      indexChanged = true;
    }
  }

  if (indexChanged) {
    await saveAllIndexes(localAdapter, meta, localIndexes);
  }

  return hydrated;
}

export async function hydrateFromLocal(
  localAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  meta: Meta = undefined,
): Promise<ReadonlyArray<string>> {
  const hydrated: string[] = [];
  const localIndexes = await loadAllIndexes(localAdapter, meta);

  for (const entityName of entityNames) {
    const localIndex = localIndexes[entityName] ?? {};
    const partitionKeys = Object.keys(localIndex);

    for (const partitionKey of partitionKeys) {
      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(localAdapter, meta, store, entityName, partitionKey),
      );
    }

    hydrated.push(entityName);
    log('hydrated %s from local (%d partitions)', entityName, partitionKeys.length);
  }

  return hydrated;
}
