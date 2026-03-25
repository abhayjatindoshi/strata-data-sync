import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import type { EntityStore } from '@strata/store';
import { syncBetween } from './unified';

const log = debug('strata:sync');

export async function hydrateFromCloud(
  cloudAdapter: BlobAdapter,
  localAdapter: BlobAdapter,
  store: EntityStore,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
): Promise<ReadonlyArray<string>> {
  const result = await syncBetween(cloudAdapter, localAdapter, store, entityNames, tenant);
  log('hydrated from cloud via syncBetween: %d copied, %d merged', result.partitionsCopied, result.partitionsMerged);
  return result.hydratedEntityNames;
}
