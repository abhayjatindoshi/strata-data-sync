import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import { serialize, deserialize } from '@strata/persistence';
import { purgeStaleTombstones, DEFAULT_TOMBSTONE_RETENTION_MS } from '@strata/sync/tombstone';
import type { EntityStore } from './types';

const log = debug('strata:store');

export async function flushPartition(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  store: EntityStore,
  entityKey: string,
  retentionMs: number = DEFAULT_TOMBSTONE_RETENTION_MS,
): Promise<void> {
  const dotIndex = entityKey.indexOf('.');
  const entityName = entityKey.substring(0, dotIndex);
  const partitionKey = entityKey.substring(dotIndex + 1);

  const partition = store.getPartition(entityKey);
  const entities: Record<string, unknown> = {};
  for (const [id, entity] of partition) {
    entities[id] = entity;
  }

  const tombstoneMap = new Map(store.getTombstones(entityKey));
  purgeStaleTombstones(tombstoneMap, retentionMs, Date.now());

  const tombstones: Record<string, Hlc> = {};
  for (const [id, hlc] of tombstoneMap) {
    tombstones[id] = hlc;
  }

  const blob = {
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
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

export async function loadPartitionFromAdapter(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  store: EntityStore,
  entityName: string,
  partitionKey: string,
): Promise<Map<string, unknown>> {
  const key = partitionBlobKey(entityName, partitionKey);
  const data = await adapter.read(cloudMeta, key);
  if (!data) return new Map();

  const blob = deserialize<Record<string, unknown>>(data);
  const entities =
    (blob[entityName] as Record<string, unknown> | undefined) ?? {};

  const deletedSection = blob['deleted'] as Record<string, unknown> | undefined;
  const tombstoneData =
    (deletedSection?.[entityName] as Record<string, Hlc> | undefined) ?? {};

  const entityKey = partitionBlobKey(entityName, partitionKey);
  for (const [id, hlc] of Object.entries(tombstoneData)) {
    store.setTombstone(entityKey, id, hlc);
  }

  return new Map(Object.entries(entities));
}
