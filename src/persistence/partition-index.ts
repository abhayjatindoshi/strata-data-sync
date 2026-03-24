import type { BlobAdapter, Meta } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { AllIndexes, PartitionIndex } from './types';
import { serialize, deserialize } from './serialize';

export async function loadAllIndexes(
  adapter: BlobAdapter,
  meta: Meta,
): Promise<AllIndexes> {
  const data = await adapter.read(meta, STRATA_MARKER_KEY);
  if (!data) return {};
  const blob = deserialize<{ indexes?: AllIndexes }>(data);
  return blob.indexes ?? {};
}

export async function saveAllIndexes(
  adapter: BlobAdapter,
  meta: Meta,
  indexes: AllIndexes,
): Promise<void> {
  const existing = await adapter.read(meta, STRATA_MARKER_KEY);
  let blob: Record<string, unknown>;
  if (existing) {
    blob = deserialize<Record<string, unknown>>(existing);
  } else {
    blob = { version: 1, createdAt: new Date(), entityTypes: [] };
  }
  blob.indexes = indexes;
  const data = serialize(blob);
  await adapter.write(meta, STRATA_MARKER_KEY, data);
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
