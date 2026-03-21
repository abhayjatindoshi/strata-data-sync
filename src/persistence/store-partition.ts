import type { BlobAdapter } from './blob-adapter.js';
import type { EntityDef } from '../schema/index.js';
import { serialize } from './serialize.js';
import { buildEntityKey } from '../entity/index.js';
import { scopeEntityKey } from '../tenant/index.js';

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
