import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import { serialize } from '@strata/persistence';
import type { EntityStore } from './types';

const log = debug('strata:store');

export async function flushPartition(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  store: EntityStore,
  entityKey: string,
): Promise<void> {
  const dotIndex = entityKey.indexOf('.');
  const entityName = entityKey.substring(0, dotIndex);
  const partitionKey = entityKey.substring(dotIndex + 1);

  const partition = store.getPartition(entityKey);
  const entities: Record<string, unknown> = {};
  for (const [id, entity] of partition) {
    entities[id] = entity;
  }

  const blob = {
    [entityName]: entities,
    deleted: { [entityName]: {} },
  };

  const data = serialize(blob);
  const key = partitionBlobKey(entityName, partitionKey);
  await adapter.write(cloudMeta, key, data);
  log('flushed partition %s', entityKey);
}

export async function flushAll(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  store: EntityStore,
): Promise<void> {
  const dirtyKeys = [...store.getDirtyKeys()];
  for (const entityKey of dirtyKeys) {
    await flushPartition(adapter, cloudMeta, store, entityKey);
    store.clearDirty(entityKey);
  }
}
