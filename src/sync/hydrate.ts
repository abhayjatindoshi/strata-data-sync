import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import { loadAllIndexes } from '@strata/persistence';
import type { EntityStore } from '@strata/store';
import { loadPartitionFromAdapter } from '@strata/store';
import { syncBetween } from './unified';

const log = debug('strata:sync');

export async function hydrateFromCloud(
  cloudAdapter: BlobAdapter,
  localAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  meta: Meta,
): Promise<ReadonlyArray<string>> {
  const result = await syncBetween(cloudAdapter, localAdapter, store, entityNames, meta);
  log('hydrated from cloud via syncBetween: %d copied, %d merged', result.partitionsCopied, result.partitionsMerged);
  return result.hydratedEntityNames;
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
