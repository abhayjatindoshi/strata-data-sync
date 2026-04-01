import debug from 'debug';
import type { Tenant } from '@strata/adapter';
import type { AllIndexes, PartitionBlob, DataAdapter } from '@strata/persistence';
import type { ResolvedStrataOptions } from '../options';

const log = debug('strata:tenant');

const MARKER_ENTITY_KEY = '__system';

export type MarkerData = {
  readonly version: number;
  readonly createdAt: Date;
  readonly entityTypes: readonly string[];
  readonly indexes?: AllIndexes;
  readonly dek?: string;
};

export async function writeMarkerBlob(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  entityTypes: readonly string[],
  options: ResolvedStrataOptions,
  dekBase64?: string,
): Promise<void> {
  const marker: MarkerData = {
    version: 1,
    createdAt: new Date(),
    entityTypes,
    indexes: {},
    ...(dekBase64 ? { dek: dekBase64 } : {}),
  };
  const blob: PartitionBlob = {
    [MARKER_ENTITY_KEY]: { marker },
    deleted: {},
  };
  await adapter.write(tenant, options.markerKey, blob);
  log('wrote marker blob');
}

export async function readMarkerBlob(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  options: ResolvedStrataOptions,
): Promise<MarkerData | undefined> {
  const blob = await adapter.read(tenant, options.markerKey);
  if (!blob) return undefined;
  const systemEntities = blob[MARKER_ENTITY_KEY] as Record<string, unknown> | undefined;
  if (!systemEntities) return undefined;
  return systemEntities['marker'] as MarkerData | undefined;
}

export function validateMarkerBlob(data: MarkerData): boolean {
  return data.version === 1;
}
