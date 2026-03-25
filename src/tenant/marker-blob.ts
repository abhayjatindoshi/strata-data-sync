import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { AllIndexes } from '@strata/persistence';

const log = debug('strata:tenant');

export type MarkerBlob = {
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
  const marker: MarkerBlob = {
    version: 1,
    createdAt: new Date(),
    entityTypes,
    indexes: {},
  };
  await adapter.write(tenant, STRATA_MARKER_KEY, marker);
  log('wrote marker blob');
}

export async function readMarkerBlob(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<MarkerBlob | undefined> {
  const data = await adapter.read(tenant, STRATA_MARKER_KEY);
  if (!data) return undefined;
  return data as MarkerBlob;
}

export function validateMarkerBlob(blob: MarkerBlob): boolean {
  return blob.version === 1;
}
