import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { EntityDefinition } from '@strata/schema/types';
import { migrateEntity } from '@strata/schema/migration';
import type { EntityStore } from './types';

const log = debug('strata:store');

export async function loadPartitionFromAdapter(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  store: EntityStore,
  entityName: string,
  partitionKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition?: EntityDefinition<any>,
): Promise<Map<string, unknown>> {
  const key = partitionBlobKey(entityName, partitionKey);
  const blob = await adapter.read(tenant, key);
  if (!blob) return new Map();

  const entities =
    (blob[entityName] as Record<string, unknown> | undefined) ?? {};
  const tombstoneData = blob.deleted[entityName] ?? {};

  const entityKey = partitionBlobKey(entityName, partitionKey);
  for (const [id, hlc] of Object.entries(tombstoneData)) {
    store.setTombstone(entityKey, id, hlc);
  }

  let migrated = false;
  for (const [id, entity] of Object.entries(entities)) {
    const rec = entity as Record<string, unknown>;
    const storedVersion = (rec.__v as number | undefined) ?? 1;
    if (definition?.migrations && storedVersion < definition.version) {
      entities[id] = migrateEntity(rec, storedVersion, definition.version, definition.migrations);
      migrated = true;
    }
    delete (entities[id] as Record<string, unknown>).__v;
  }

  if (migrated) {
    log('migrated entities in %s.%s', entityName, partitionKey);
  }

  return new Map(Object.entries(entities));
}
