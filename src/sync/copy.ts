import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { PartitionDiffResult } from './types';

const log = debug('strata:sync');

export async function copyPartitionToCloud(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
  partitionKey: string,
): Promise<void> {
  const key = partitionBlobKey(entityName, partitionKey);
  const data = await localAdapter.read(undefined, key);
  if (!data) return;
  await cloudAdapter.write(cloudMeta, key, data);
  log('copied %s to cloud', key);
}

export async function copyPartitionToLocal(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
  partitionKey: string,
): Promise<void> {
  const key = partitionBlobKey(entityName, partitionKey);
  const data = await cloudAdapter.read(cloudMeta, key);
  if (!data) return;
  await localAdapter.write(undefined, key, data);
  log('copied %s to local', key);
}

export async function syncCopyPhase(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
  diff: PartitionDiffResult,
): Promise<ReadonlyArray<string>> {
  const copiedKeys: string[] = [];

  for (const key of diff.localOnly) {
    await copyPartitionToCloud(
      localAdapter, cloudAdapter, cloudMeta, entityName, key,
    );
    copiedKeys.push(key);
  }

  for (const key of diff.cloudOnly) {
    await copyPartitionToLocal(
      localAdapter, cloudAdapter, cloudMeta, entityName, key,
    );
    copiedKeys.push(key);
  }

  log('copy phase complete: %d partitions copied', copiedKeys.length);
  return copiedKeys;
}
