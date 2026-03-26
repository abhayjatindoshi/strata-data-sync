import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import { partitionBlobKey } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import type { PartitionIndex } from '@strata/persistence';
import {
  partitionHash,
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
  tenant: Tenant | undefined,
  entityName: string,
  divergedKeys: ReadonlyArray<string>,
): Promise<ReadonlyArray<MergedPartitionResult>> {
  const results: MergedPartitionResult[] = [];

  for (const partitionKey of divergedKeys) {
    const blobKey = partitionBlobKey(entityName, partitionKey);
    const [localBlob, cloudBlob] = await Promise.all([
      localAdapter.read(tenant, blobKey),
      cloudAdapter.read(tenant, blobKey),
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

    await Promise.all([
      localAdapter.write(tenant, blobKey, mergedBlobData),
      cloudAdapter.write(tenant, blobKey, mergedBlobData),
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
  tenant: Tenant | undefined,
  entityName: string,
  localIndex: PartitionIndex,
  cloudIndex: PartitionIndex,
  syncedPartitions: ReadonlyArray<string>,
): Promise<{ updatedLocal: PartitionIndex; updatedCloud: PartitionIndex }> {
  let updatedLocal = { ...localIndex };
  let updatedCloud = { ...cloudIndex };

  for (const partitionKey of syncedPartitions) {
    const blobKey = partitionBlobKey(entityName, partitionKey);
    const blob = await localAdapter.read(tenant, blobKey);
    if (!blob) continue;

    const entities =
      (blob[entityName] as Record<string, unknown> | undefined) ?? {};
    const tombstones = blob.deleted[entityName] ?? {};

    const hlcMap = buildHlcMap(entities, tombstones);
    const hash = partitionHash(hlcMap);
    const count = hlcMap.size;
    const deletedCount = Object.keys(tombstones).length;

    updatedLocal = updatePartitionIndexEntry(
      updatedLocal, partitionKey, hash, count, deletedCount,
    );
    updatedCloud = updatePartitionIndexEntry(
      updatedCloud, partitionKey, hash, count, deletedCount,
    );
  }

  log('updated indexes for %s after sync', entityName);
  return { updatedLocal, updatedCloud };
}
