import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import type { AllIndexes } from '@strata/persistence';
import {
  serialize, deserialize, partitionHash,
  loadAllIndexes, saveAllIndexes, updatePartitionIndexEntry,
} from '@strata/persistence';
import { purgeStaleTombstones, DEFAULT_TOMBSTONE_RETENTION_MS } from '@strata/sync/tombstone';
import type { EntityStore } from './types';

const log = debug('strata:store');

export async function flushPartition(
  adapter: BlobAdapter,
  meta: Meta,
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
  await adapter.write(meta, key, data);
  log('flushed partition %s', entityKey);
}

export async function flushAll(
  adapter: BlobAdapter,
  meta: Meta,
  store: EntityStore,
): Promise<void> {
  const dirtyKeys = [...store.getDirtyKeys()];
  const affectedEntityNames = new Set<string>();

  for (const entityKey of dirtyKeys) {
    await flushPartition(adapter, meta, store, entityKey);
    store.clearDirty(entityKey);
    const dotIndex = entityKey.indexOf('.');
    affectedEntityNames.add(entityKey.substring(0, dotIndex));
  }

  if (affectedEntityNames.size > 0) {
    await flushPartitionIndexes(adapter, meta, store, affectedEntityNames);
  }
}

async function flushPartitionIndexes(
  adapter: BlobAdapter,
  meta: Meta,
  store: EntityStore,
  affectedEntityNames: ReadonlySet<string>,
): Promise<void> {
  const indexes = await loadAllIndexes(adapter, meta);

  for (const entityName of affectedEntityNames) {
    let entityIndex = indexes[entityName] ?? {};
    const partitionKeys = store.getAllPartitionKeys(entityName);

    for (const entityKey of partitionKeys) {
      const dotIndex = entityKey.indexOf('.');
      const partitionKey = entityKey.substring(dotIndex + 1);

      const partition = store.getPartition(entityKey);
      const tombstones = store.getTombstones(entityKey);

      const hlcMap = new Map<string, Hlc>();
      for (const [id, entity] of partition) {
        const hlc = (entity as { hlc?: Hlc }).hlc;
        if (hlc) hlcMap.set(id, hlc);
      }
      for (const [id, hlc] of tombstones) {
        hlcMap.set(`\0${id}`, hlc);
      }

      const hash = partitionHash(hlcMap);
      const count = hlcMap.size;
      entityIndex = updatePartitionIndexEntry(entityIndex, partitionKey, hash, count);
    }

    indexes[entityName] = entityIndex;
  }

  await saveAllIndexes(adapter, meta, indexes);
  log('updated partition indexes for %s', [...affectedEntityNames].join(', '));
}

export async function loadPartitionFromAdapter(
  adapter: BlobAdapter,
  meta: Meta,
  store: EntityStore,
  entityName: string,
  partitionKey: string,
): Promise<Map<string, unknown>> {
  const key = partitionBlobKey(entityName, partitionKey);
  const data = await adapter.read(meta, key);
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
