import debug from 'debug';
import type { Tenant } from '@/adapter';
import type { AllIndexes, PartitionIndex, PartitionIndexEntry, DataAdapter } from '@/persistence';
import { loadAllIndexes } from '@/persistence';
import type { ResolvedStrataOptions } from '../options';
import type { PartitionDiffResult } from './types';

const log = debug('strata:sync');

export async function loadAllIndexPairs(
  localAdapter: DataAdapter,
  cloudAdapter: DataAdapter,
  tenant: Tenant | undefined,
  options: ResolvedStrataOptions,
): Promise<{ localIndexes: AllIndexes; cloudIndexes: AllIndexes }> {
  const [localIndexes, cloudIndexes] = await Promise.all([
    loadAllIndexes(localAdapter, tenant, options),
    loadAllIndexes(cloudAdapter, tenant, options),
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
    const local = localIndex[key] as PartitionIndexEntry | undefined;
    const cloud = cloudIndex[key] as PartitionIndexEntry | undefined;

    if (local && !cloud) {
      localOnly.push(key);
    } else if (!local && cloud) {
      cloudOnly.push(key);
    } else if (local && cloud) {
      if (local.hash === cloud.hash && local.count === cloud.count && local.deletedCount === cloud.deletedCount) {
        unchanged.push(key);
      } else {
        diverged.push(key);
      }
    }
  }

  return { localOnly, cloudOnly, diverged, unchanged };
}
