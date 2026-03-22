import type { BlobAdapter } from './blob-adapter';
import type { EntityDef } from '@strata/schema';
import { deserialize } from './deserialize';
import { buildEntityKey } from '@strata/entity';
import { scopeEntityKey } from '@strata/tenant';

export async function loadPartition<TName extends string, TFields>(
  adapter: BlobAdapter,
  entityDef: EntityDef<TName, TFields>,
  partitionKey: string,
  tenantId?: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const entityKey = buildEntityKey(entityDef.name, partitionKey);
  const adapterKey = tenantId ? scopeEntityKey(tenantId, entityKey) : entityKey;
  const data = await adapter.read(adapterKey);
  if (!data) return [];

  const json = new TextDecoder().decode(data);
  const blob = deserialize(json);

  const entityGroup = blob.entities[entityDef.name];
  if (!entityGroup) return [];

  return Object.values(entityGroup);
}
