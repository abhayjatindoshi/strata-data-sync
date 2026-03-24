import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import type { PartitionIndex } from '@strata/persistence';
import {
  serialize,
  deserialize,
  partitionHash,
  savePartitionIndex,
  updatePartitionIndexEntry,
} from '@strata/persistence';
import type { EntityStore } from '@strata/store';
import type { EntityEventBus } from '@strata/reactive';
import type { MergedPartitionResult, SyncEntity } from './types';
import { mergePartition } from './merge';

const log = debug('strata:sync');

export async function syncMergePhase(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
  divergedKeys: ReadonlyArray<string>,
): Promise<ReadonlyArray<MergedPartitionResult>> {
  const results: MergedPartitionResult[] = [];

  for (const partitionKey of divergedKeys) {
    const blobKey = partitionBlobKey(entityName, partitionKey);
    const [localBlob, cloudBlob] = await Promise.all([
      localAdapter.read(undefined, blobKey),
      cloudAdapter.read(cloudMeta, blobKey),
    ]);

    if (!localBlob || !cloudBlob) {
      log('skipping merge for %s: missing blob', blobKey);
      continue;
    }

    const merged = mergePartition(localBlob, cloudBlob, entityName);
    const mergedBlobData = {
      [entityName]: merged.entities,
      deleted: { [entityName]: merged.tombstones },
    };
    const mergedBytes = serialize(mergedBlobData);

    await Promise.all([
      localAdapter.write(undefined, blobKey, mergedBytes),
      cloudAdapter.write(cloudMeta, blobKey, mergedBytes),
    ]);

    results.push({ partitionKey, ...merged });
    log('merged partition %s', blobKey);
  }

  return results;
}

function buildHlcMap(
  entities: Readonly<Record<string, unknown>>,
  tombstones: Readonly<Record<string, Hlc>>,
): Map<string, Hlc> {
  const hlcMap = new Map<string, Hlc>();
  for (const [id, entity] of Object.entries(entities)) {
    // Type assertion needed: entities from deserialized blobs have hlc fields
    hlcMap.set(id, (entity as SyncEntity).hlc);
  }
  for (const [id, hlc] of Object.entries(tombstones)) {
    hlcMap.set(`\0${id}`, hlc);
  }
  return hlcMap;
}

export async function updateIndexesAfterSync(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  cloudMeta: CloudMeta,
  entityName: string,
  localIndex: PartitionIndex,
  cloudIndex: PartitionIndex,
  syncedPartitions: ReadonlyArray<string>,
): Promise<void> {
  let updatedLocal = { ...localIndex };
  let updatedCloud = { ...cloudIndex };

  for (const partitionKey of syncedPartitions) {
    const blobKey = partitionBlobKey(entityName, partitionKey);
    const blob = await localAdapter.read(undefined, blobKey);
    if (!blob) continue;

    const data = deserialize<Record<string, unknown>>(blob);
    const entities =
      (data[entityName] as Record<string, unknown> | undefined) ?? {};
    const deleted = data['deleted'] as Record<string, unknown> | undefined;
    const tombstones =
      (deleted?.[entityName] as Record<string, Hlc> | undefined) ?? {};

    const hlcMap = buildHlcMap(entities, tombstones);
    const hash = partitionHash(hlcMap);
    const count = hlcMap.size;

    updatedLocal = updatePartitionIndexEntry(
      updatedLocal, partitionKey, hash, count,
    );
    updatedCloud = updatePartitionIndexEntry(
      updatedCloud, partitionKey, hash, count,
    );
  }

  await Promise.all([
    savePartitionIndex(localAdapter, undefined, entityName, updatedLocal),
    savePartitionIndex(cloudAdapter, cloudMeta, entityName, updatedCloud),
  ]);
  log('updated indexes for %s after sync', entityName);
}

export function applyMergedToStore(
  store: EntityStore,
  entityName: string,
  mergedResults: ReadonlyArray<MergedPartitionResult>,
  eventBus: EntityEventBus,
): void {
  for (const { partitionKey, entities, tombstones } of mergedResults) {
    const entityKey = partitionBlobKey(entityName, partitionKey);

    for (const [id, entity] of Object.entries(entities)) {
      store.set(entityKey, id, entity);
    }

    for (const id of Object.keys(tombstones)) {
      store.delete(entityKey, id);
    }
  }

  if (mergedResults.length > 0) {
    eventBus.emit({ entityName });
  }
}
