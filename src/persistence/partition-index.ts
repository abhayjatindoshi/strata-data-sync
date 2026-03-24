import type { BlobAdapter, Meta } from '@strata/adapter';
import { INDEX_KEY } from '@strata/adapter';
import type { AllIndexes, PartitionIndex } from './types';
import { serialize, deserialize } from './serialize';

export async function loadAllIndexes(
  adapter: BlobAdapter,
  meta: Meta,
): Promise<AllIndexes> {
  const data = await adapter.read(meta, INDEX_KEY);
  if (!data) return {};
  return deserialize<AllIndexes>(data);
}

export async function saveAllIndexes(
  adapter: BlobAdapter,
  meta: Meta,
  indexes: AllIndexes,
): Promise<void> {
  const data = serialize(indexes);
  await adapter.write(meta, INDEX_KEY, data);
}

export function updatePartitionIndexEntry(
  index: PartitionIndex,
  partitionKey: string,
  hash: number,
  count: number,
): PartitionIndex {
  return {
    ...index,
    [partitionKey]: { hash, count, updatedAt: Date.now() },
  };
}
