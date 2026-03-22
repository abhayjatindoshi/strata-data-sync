import type { BlobAdapter } from './blob-adapter';
import type { EntityDef } from '@strata/schema';
import { serialize } from './serialize';
import { buildEntityKey } from '@strata/entity';
import { scopeEntityKey } from '@strata/tenant';

export async function storePartition<TName extends string, TFields>(
  adapter: BlobAdapter,
  entityDef: EntityDef<TName, TFields>,
  partitionKey: string,
  entities: readonly Readonly<Record<string, unknown>>[],
  tenantId?: string,
): Promise<void> {
  const entityKey = buildEntityKey(entityDef.name, partitionKey);
  const adapterKey = tenantId ? scopeEntityKey(tenantId, entityKey) : entityKey;

  const entityGroup: Record<string, Record<string, unknown>> = {};
  for (const entity of entities) {
    const id = entity['id'];
    if (typeof id !== 'string') {
      throw new Error('Entity must have a string "id" field');
    }
    entityGroup[id] = { ...entity };
  }

  const blob = { [entityDef.name]: entityGroup };
  const json = serialize(blob);
  const data = new TextEncoder().encode(json);
  await adapter.write(adapterKey, data);
}
