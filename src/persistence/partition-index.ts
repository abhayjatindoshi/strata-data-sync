import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { indexKey } from '@strata/adapter';
import type { PartitionIndex } from './types';
import { serialize, deserialize } from './serialize';

export async function loadPartitionIndex(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
): Promise<PartitionIndex> {
  const key = indexKey(entityName);
  const data = await adapter.read(cloudMeta, key);
  if (!data) return {};
  return deserialize<PartitionIndex>(data);
}

export async function savePartitionIndex(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
  index: PartitionIndex,
): Promise<void> {
  const key = indexKey(entityName);
  const data = serialize(index);
  await adapter.write(cloudMeta, key, data);
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
