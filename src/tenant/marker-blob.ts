import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { AllIndexes } from '@strata/persistence';
import { serialize, deserialize } from '@strata/persistence';

const log = debug('strata:tenant');

export type MarkerBlob = {
  readonly version: number;
  readonly createdAt: Date;
  readonly entityTypes: readonly string[];
  readonly indexes?: AllIndexes;
};

export async function writeMarkerBlob(
  adapter: BlobAdapter,
  meta: Meta,
  entityTypes: readonly string[],
): Promise<void> {
  const marker: MarkerBlob = {
    version: 1,
    createdAt: new Date(),
    entityTypes,
    indexes: {},
  };
  const data = serialize(marker);
  await adapter.write(meta, STRATA_MARKER_KEY, data);
  log('wrote marker blob');
}

export async function readMarkerBlob(
  adapter: BlobAdapter,
  meta: Meta,
): Promise<MarkerBlob | undefined> {
  const data = await adapter.read(meta, STRATA_MARKER_KEY);
  if (!data) return undefined;
  return deserialize<MarkerBlob>(data);
}

export function validateMarkerBlob(blob: MarkerBlob): boolean {
  return blob.version === 1;
}
