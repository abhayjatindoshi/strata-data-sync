import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { AllIndexes, PartitionBlob } from '@strata/persistence';

const log = debug('strata:tenant');

const MARKER_ENTITY_KEY = '__system';

export type MarkerData = {
  readonly version: number;
  readonly createdAt: Date;
  readonly entityTypes: readonly string[];
  readonly indexes?: AllIndexes;
};

export async function writeMarkerBlob(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  entityTypes: readonly string[],
): Promise<void> {
  const marker: MarkerData = {
    version: 1,
    createdAt: new Date(),
    entityTypes,
    indexes: {},
  };
  const blob: PartitionBlob = {
    [MARKER_ENTITY_KEY]: { marker },
    deleted: {},
  };
  await adapter.write(tenant, STRATA_MARKER_KEY, blob);
  log('wrote marker blob');
}

export async function readMarkerBlob(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<MarkerData | undefined> {
  const blob = await adapter.read(tenant, STRATA_MARKER_KEY);
  if (!blob) return undefined;
  const systemEntities = blob[MARKER_ENTITY_KEY] as Record<string, unknown> | undefined;
  if (!systemEntities) return undefined;
  return systemEntities['marker'] as MarkerData | undefined;
}

export function validateMarkerBlob(data: MarkerData): boolean {
  return data.version === 1;
}
