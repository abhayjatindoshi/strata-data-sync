import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import { serialize, deserialize } from '@strata/persistence';

const log = debug('strata:tenant');

export type MarkerBlob = {
  readonly version: number;
  readonly createdAt: Date;
  readonly entityTypes: readonly string[];
};

export async function writeMarkerBlob(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityTypes: readonly string[],
): Promise<void> {
  const marker: MarkerBlob = {
    version: 1,
    createdAt: new Date(),
    entityTypes,
  };
  const data = serialize(marker);
  await adapter.write(cloudMeta, STRATA_MARKER_KEY, data);
  log('wrote marker blob');
}

export async function readMarkerBlob(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
): Promise<MarkerBlob | undefined> {
  const data = await adapter.read(cloudMeta, STRATA_MARKER_KEY);
  if (!data) return undefined;
  return deserialize<MarkerBlob>(data);
}

export function validateMarkerBlob(blob: MarkerBlob): boolean {
  return blob.version === 1;
}
