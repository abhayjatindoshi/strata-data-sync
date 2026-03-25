import type { BlobAdapter, Tenant } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { AllIndexes, PartitionIndex } from './types';

export async function loadAllIndexes(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<AllIndexes> {
  const data = await adapter.read(tenant, STRATA_MARKER_KEY);
  if (!data) return {};
  const blob = data as { indexes?: AllIndexes };
  return blob.indexes ?? {};
}

export async function saveAllIndexes(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  indexes: AllIndexes,
): Promise<void> {
  const existing = await adapter.read(tenant, STRATA_MARKER_KEY);
  let blob: Record<string, unknown>;
  if (existing) {
    blob = existing as Record<string, unknown>;
  } else {
    blob = { version: 1, createdAt: new Date(), entityTypes: [] };
  }
  blob.indexes = indexes;
  await adapter.write(tenant, STRATA_MARKER_KEY, blob);
}

export function updatePartitionIndexEntry(
  index: PartitionIndex,
  partitionKey: string,
  hash: number,
  count: number,
  deletedCount: number,
): PartitionIndex {
  return {
    ...index,
    [partitionKey]: { hash, count, deletedCount, updatedAt: Date.now() },
  };
}
