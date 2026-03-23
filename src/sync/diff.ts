import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import type { PartitionIndex } from '@strata/persistence';
import { loadPartitionIndex } from '@strata/persistence';
import type { PartitionDiffResult } from './types';

const log = debug('strata:sync');

export async function loadIndexPair(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
): Promise<{ localIndex: PartitionIndex; cloudIndex: PartitionIndex }> {
  const [localIndex, cloudIndex] = await Promise.all([
    loadPartitionIndex(localAdapter, undefined, entityName),
    loadPartitionIndex(cloudAdapter, cloudMeta, entityName),
  ]);
  log('loaded index pair for %s', entityName);
  return { localIndex, cloudIndex };
}

export function diffPartitions(
  localIndex: PartitionIndex,
  cloudIndex: PartitionIndex,
): PartitionDiffResult {
  const localOnly: string[] = [];
  const cloudOnly: string[] = [];
  const diverged: string[] = [];
  const unchanged: string[] = [];

  const allKeys = new Set([
    ...Object.keys(localIndex),
    ...Object.keys(cloudIndex),
  ]);

  for (const key of allKeys) {
    const local = localIndex[key];
    const cloud = cloudIndex[key];

    if (local && !cloud) {
      localOnly.push(key);
    } else if (!local && cloud) {
      cloudOnly.push(key);
    } else if (local && cloud) {
      if (local.hash === cloud.hash) {
        unchanged.push(key);
      } else {
        diverged.push(key);
      }
    }
  }

  return { localOnly, cloudOnly, diverged, unchanged };
}
