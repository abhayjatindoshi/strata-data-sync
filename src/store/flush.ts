import debug from 'debug';
import type { Tenant } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { DataAdapter } from '@strata/persistence';
import type { BlobMigration } from '@strata/schema/migration';
import { migrateBlob } from '@strata/schema/migration';
import type { EntityStore } from './types';

const log = debug('strata:store');

export async function loadPartitionFromAdapter(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  store: EntityStore,
  entityName: string,
  partitionKey: string,
  migrations?: ReadonlyArray<BlobMigration>,
): Promise<Map<string, unknown>> {
  const key = partitionBlobKey(entityName, partitionKey);
  let blob = await adapter.read(tenant, key);
  if (!blob) return new Map();

  if (migrations && migrations.length > 0) {
    blob = migrateBlob(blob, migrations, entityName);
  }

  const entities =
    (blob[entityName] as Record<string, unknown> | undefined) ?? {};
  const tombstoneData = blob.deleted[entityName] ?? {};

  for (const [id, hlc] of Object.entries(tombstoneData)) {
    store.setTombstone(key, id, hlc);
  }

  return new Map(Object.entries(entities));
}
