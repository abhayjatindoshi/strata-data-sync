import type { BlobAdapter, Tenant } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { AllIndexes, PartitionIndex, PartitionBlob } from './types';

const MARKER_ENTITY_KEY = '__system';

export async function loadAllIndexes(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<AllIndexes> {
  const blob = await adapter.read(tenant, STRATA_MARKER_KEY);
  if (!blob) return {};
  const systemEntities = blob[MARKER_ENTITY_KEY] as Record<string, unknown> | undefined;
  if (!systemEntities) return {};
  const marker = systemEntities['marker'] as { indexes?: AllIndexes } | undefined;
  return marker?.indexes ?? {};
}

export async function saveAllIndexes(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  indexes: AllIndexes,
): Promise<void> {
  const existing = await adapter.read(tenant, STRATA_MARKER_KEY);
  let markerData: Record<string, unknown>;
  if (existing) {
    const systemEntities = existing[MARKER_ENTITY_KEY] as Record<string, unknown> | undefined;
    markerData = systemEntities?.['marker'] as Record<string, unknown> ?? { version: 1, createdAt: new Date(), entityTypes: [] };
  } else {
    markerData = { version: 1, createdAt: new Date(), entityTypes: [] };
  }
  markerData['indexes'] = indexes;
  const blob: PartitionBlob = {
    [MARKER_ENTITY_KEY]: { marker: markerData },
    deleted: {},
  };
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
