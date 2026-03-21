import type { BlobAdapter } from './blob-adapter.js';
import type { EntityDef } from '../schema/index.js';
import { deserialize } from './deserialize.js';
import { buildEntityKey } from '../entity/index.js';

export async function loadPartition<TName extends string, TFields>(
  adapter: BlobAdapter,
  entityDef: EntityDef<TName, TFields>,
  partitionKey: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const entityKey = buildEntityKey(entityDef.name, partitionKey);
  const data = await adapter.read(entityKey);
  if (!data) return [];

  const json = new TextDecoder().decode(data);
  const blob = deserialize(json);

  const entityGroup = blob.entities[entityDef.name];
  if (!entityGroup) return [];

  return Object.values(entityGroup);
}
