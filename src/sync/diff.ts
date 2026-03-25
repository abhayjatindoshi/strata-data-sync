import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import type { AllIndexes, PartitionIndex } from '@strata/persistence';
import { loadAllIndexes } from '@strata/persistence';
import type { PartitionDiffResult } from './types';

const log = debug('strata:sync');

export async function loadAllIndexPairs(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<{ localIndexes: AllIndexes; cloudIndexes: AllIndexes }> {
  const [localIndexes, cloudIndexes] = await Promise.all([
    loadAllIndexes(localAdapter, tenant),
    loadAllIndexes(cloudAdapter, tenant),
  ]);
  log('loaded all index pairs');
  return { localIndexes, cloudIndexes };
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
