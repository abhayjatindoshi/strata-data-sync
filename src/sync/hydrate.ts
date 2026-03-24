import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import { loadPartitionIndex } from '@strata/persistence';
import type { EntityStore } from '@strata/store';
import { loadPartitionFromAdapter } from '@strata/store';

const log = debug('strata:sync');

export async function hydrateFromCloud(
  cloudAdapter: BlobAdapter,
  localAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  cloudMeta: CloudMeta,
): Promise<ReadonlyArray<string>> {
  const hydrated: string[] = [];

  for (const entityName of entityNames) {
    const cloudIndex = await loadPartitionIndex(cloudAdapter, cloudMeta, entityName);
    const partitionKeys = Object.keys(cloudIndex);

    for (const partitionKey of partitionKeys) {
      const blobKey = partitionBlobKey(entityName, partitionKey);
      const cloudData = await cloudAdapter.read(cloudMeta, blobKey);
      if (cloudData) {
        await localAdapter.write(undefined, blobKey, cloudData);
      }

      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(localAdapter, undefined, store, entityName, partitionKey),
      );
    }

    hydrated.push(entityName);
    log('hydrated %s from cloud (%d partitions)', entityName, partitionKeys.length);
  }

  return hydrated;
}

export async function hydrateFromLocal(
  localAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const hydrated: string[] = [];

  for (const entityName of entityNames) {
    const localIndex = await loadPartitionIndex(localAdapter, undefined, entityName);
    const partitionKeys = Object.keys(localIndex);

    for (const partitionKey of partitionKeys) {
      const entityKey = partitionBlobKey(entityName, partitionKey);
      await store.loadPartition(entityKey, () =>
        loadPartitionFromAdapter(localAdapter, undefined, store, entityName, partitionKey),
      );
    }

    hydrated.push(entityName);
    log('hydrated %s from local (%d partitions)', entityName, partitionKeys.length);
  }

  return hydrated;
}
