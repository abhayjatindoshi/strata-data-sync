import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs';
import type { CloudMeta } from '../adapter/index.js';
import type { PartitionBlob, PartitionIndex } from '../persistence/index.js';
import type { BaseEntity } from '../entity/index.js';
import type { SyncEngine, SyncEngineConfig, SyncEventType } from './types.js';
import { createSyncScheduler } from './sync-scheduler.js';
import { comparePartitionIndexes } from './partition-diff.js';
import { mergePartitionBlobs } from './merge.js';
import { purgeExpiredTombstones } from './tombstone.js';
import { createEventBus } from '../reactive/index.js';

const INDEX_KEY = '__partition_index';
const DEFAULT_PERIODIC_MS = 300_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(data: string): Uint8Array {
  return encoder.encode(data);
}

function decode(data: Uint8Array): string {
  return decoder.decode(data);
}

async function readJson<T>(
  adapter: { read: (cm: CloudMeta, p: string) => Promise<Uint8Array | null> },
  cloudMeta: CloudMeta,
  path: string,
  deserialize: (j: string) => unknown,
): Promise<T | null> {
  const raw = await adapter.read(cloudMeta, path);
  if (!raw) return null;
  return deserialize(decode(raw)) as T;
}

async function writeJson(
  adapter: { write: (cm: CloudMeta, p: string, d: Uint8Array) => Promise<void> },
  cloudMeta: CloudMeta,
  path: string,
  data: unknown,
  serialize: (d: unknown) => string,
): Promise<void> {
  await adapter.write(cloudMeta, path, encode(serialize(data)));
}

function blobToEntities(blob: PartitionBlob): ReadonlyArray<BaseEntity> {
  return Object.values(blob.entities) as ReadonlyArray<BaseEntity>;
}

function entitiesToBlob(
  entities: ReadonlyArray<BaseEntity>,
  deleted: PartitionBlob['deleted'],
): PartitionBlob {
  const map: Record<string, unknown> = {};
  for (const e of entities) map[e.id] = e;
  return { entities: map, deleted };
}

function buildIndex(
  keys: ReadonlyArray<string>,
  getEntities: (key: string) => ReadonlyArray<BaseEntity>,
  computeHash: SyncEngineConfig['computeHash'],
): PartitionIndex {
  const idx: Record<string, { hash: number; count: number; updatedAt: string }> = {};
  for (const key of keys) {
    const entities = getEntities(key);
    idx[key] = {
      hash: computeHash(entities),
      count: entities.length,
      updatedAt: new Date().toISOString(),
    };
  }
  return idx;
}

export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
  const {
    localAdapter, cloudAdapter, store,
    serialize, deserialize, computeHash,
    periodicIntervalMs = DEFAULT_PERIODIC_MS,
    tombstoneRetentionDays,
    cloudMeta,
  } = config;

  const scheduler = createSyncScheduler();
  const eventBus = createEventBus();
  const dirtyKeys = new Set<string>();
  const dirtySubject = new BehaviorSubject<boolean>(false);
  let periodicTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function emitDirty(): void {
    dirtySubject.next(dirtyKeys.size > 0);
  }

  function markDirty(key: string): void {
    dirtyKeys.add(key);
    emitDirty();
  }

  // ---- Hydrate helpers ----

  async function loadFromAdapter(
    adapter: { read: (cm: CloudMeta, p: string) => Promise<Uint8Array | null>; list: (cm: CloudMeta, p: string) => Promise<string[]> },
    meta: CloudMeta,
  ): Promise<Map<string, PartitionBlob>> {
    const blobs = new Map<string, PartitionBlob>();
    const index = await readJson<PartitionIndex>(adapter, meta, INDEX_KEY, deserialize);
    if (!index) return blobs;
    for (const key of Object.keys(index)) {
      const blob = await readJson<PartitionBlob>(adapter, meta, key, deserialize);
      if (blob) blobs.set(key, blob);
    }
    return blobs;
  }

  function loadBlobsIntoStore(blobs: Map<string, PartitionBlob>): void {
    for (const [key, blob] of blobs) {
      const entities = blobToEntities(blob);
      store.saveMany(key, entities);
      for (const id of Object.keys(blob.deleted)) {
        store.delete(key, id);
      }
    }
  }

  async function hydrateImpl(): Promise<void> {
    eventBus.emit('started');
    try {
      let cloudBlobs: Map<string, PartitionBlob> | null = null;
      try {
        cloudBlobs = await loadFromAdapter(cloudAdapter, cloudMeta);
      } catch {
        eventBus.emit('cloud-unreachable');
      }

      const localBlobs = await loadFromAdapter(localAdapter, undefined);

      if (cloudBlobs && cloudBlobs.size > 0) {
        const allKeys = new Set([...cloudBlobs.keys(), ...localBlobs.keys()]);
        for (const key of allKeys) {
          const cBlob = cloudBlobs.get(key);
          const lBlob = localBlobs.get(key);
          const emptyBlob: PartitionBlob = { entities: {}, deleted: {} };
          const merged = mergePartitionBlobs(lBlob ?? emptyBlob, cBlob ?? emptyBlob);
          const purged = purgeExpiredTombstones(merged, tombstoneRetentionDays);
          loadBlobsIntoStore(new Map([[key, purged]]));
          await writeJson(localAdapter, undefined, key, purged, serialize);
        }
      } else {
        loadBlobsIntoStore(localBlobs);
      }

      await rebuildLocalIndex();
      eventBus.emit('completed');
    } catch {
      eventBus.emit('failed');
      throw new Error('Hydrate failed');
    }
  }

  // ---- Sync helpers ----

  async function rebuildLocalIndex(): Promise<void> {
    const keys = collectStoreKeys();
    const index = buildIndex(keys, k => store.getAll(k), computeHash);
    await writeJson(localAdapter, undefined, INDEX_KEY, index, serialize);
  }

  function collectStoreKeys(): string[] {
    const keys: string[] = [];
    const index = readIndexSync();
    if (index) keys.push(...Object.keys(index));
    // Also check store for any entity keys
    return keys;
  }

  function readIndexSync(): PartitionIndex | null {
    // We don't have sync read for adapter, we'll use async version
    return null;
  }

  async function flushToLocal(): Promise<void> {
    const keys = [...dirtyKeys];
    dirtyKeys.clear();
    emitDirty();
    for (const key of keys) {
      const entities = store.getAll(key);
      // Read existing blob for tombstones
      const existing = await readJson<PartitionBlob>(
        localAdapter, undefined, key, deserialize,
      );
      const deleted = existing?.deleted ?? {};
      const blob = purgeExpiredTombstones(
        entitiesToBlob(entities, deleted),
        tombstoneRetentionDays,
      );
      await writeJson(localAdapter, undefined, key, blob, serialize);
    }
    await rebuildLocalIndexFromAdapter();
  }

  async function rebuildLocalIndexFromAdapter(): Promise<void> {
    const existingIndex = await readJson<PartitionIndex>(
      localAdapter, undefined, INDEX_KEY, deserialize,
    );
    const knownKeys = new Set<string>();
    if (existingIndex) {
      for (const k of Object.keys(existingIndex)) knownKeys.add(k);
    }
    // Also add keys from store partitions
    // We scan adapter for partition blobs
    const allFiles = await localAdapter.list(undefined, '');
    for (const f of allFiles) {
      if (f !== INDEX_KEY && !f.startsWith('__')) knownKeys.add(f);
    }

    const idx: Record<string, { hash: number; count: number; updatedAt: string }> = {};
    for (const key of knownKeys) {
      const blob = await readJson<PartitionBlob>(
        localAdapter, undefined, key, deserialize,
      );
      if (blob) {
        const entities = blobToEntities(blob);
        idx[key] = {
          hash: computeHash(entities as ReadonlyArray<BaseEntity>),
          count: entities.length,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    await writeJson(localAdapter, undefined, INDEX_KEY, idx, serialize);
  }

  async function syncBidirectional(): Promise<void> {
    eventBus.emit('started');
    try {
      // 1. Flush memory → local
      await flushToLocal();

      // 2. Read indexes
      const localIndex = await readJson<PartitionIndex>(
        localAdapter, undefined, INDEX_KEY, deserialize,
      ) ?? {};

      let cloudIndex: PartitionIndex;
      try {
        cloudIndex = await readJson<PartitionIndex>(
          cloudAdapter, cloudMeta, INDEX_KEY, deserialize,
        ) ?? {};
      } catch {
        eventBus.emit('cloud-unreachable');
        return;
      }

      // 3. Diff
      const diff = comparePartitionIndexes(localIndex, cloudIndex);
      const emptyBlob: PartitionBlob = { entities: {}, deleted: {} };

      // 4. Copy-only: cloud-only partitions → local (TASK-003)
      for (const key of diff.added) {
        const blob = await readCloudBlob(key);
        if (!blob) continue;
        const purged = purgeExpiredTombstones(blob, tombstoneRetentionDays);
        await writeJson(localAdapter, undefined, key, purged, serialize);
        loadBlobsIntoStore(new Map([[key, purged]]));
      }

      // 5. Copy-only: local-only partitions → cloud (TASK-003)
      for (const key of diff.removed) {
        const blob = await readJson<PartitionBlob>(
          localAdapter, undefined, key, deserialize,
        );
        if (!blob) continue;
        await writeJson(cloudAdapter, cloudMeta, key, blob, serialize);
      }

      // 6. Merge changed partitions
      for (const key of diff.changed) {
        const localBlob = await readJson<PartitionBlob>(
          localAdapter, undefined, key, deserialize,
        ) ?? emptyBlob;
        const cloudBlob = await readCloudBlob(key) ?? emptyBlob;
        const merged = mergePartitionBlobs(localBlob, cloudBlob);
        const purged = purgeExpiredTombstones(merged, tombstoneRetentionDays);
        await writeJson(localAdapter, undefined, key, purged, serialize);
        await writeJson(cloudAdapter, cloudMeta, key, purged, serialize);
        loadBlobsIntoStore(new Map([[key, purged]]));
      }

      // 7. Stale detection (TASK-003): re-read cloud index
      try {
        const postCloudIndex = await readJson<PartitionIndex>(
          cloudAdapter, cloudMeta, INDEX_KEY, deserialize,
        ) ?? {};
        const staleCheck = comparePartitionIndexes(cloudIndex, postCloudIndex);
        if (staleCheck.changed.length > 0 || staleCheck.added.length > 0) {
          // Another client changed data during our sync; mark for next cycle
          for (const k of [...staleCheck.changed, ...staleCheck.added]) {
            markDirty(k);
          }
        }
      } catch {
        // Cloud check failed, not fatal
      }

      // 8. Rebuild local index and push to cloud
      await rebuildLocalIndexFromAdapter();
      const finalIndex = await readJson<PartitionIndex>(
        localAdapter, undefined, INDEX_KEY, deserialize,
      );
      if (finalIndex) {
        await writeJson(cloudAdapter, cloudMeta, INDEX_KEY, finalIndex, serialize);
      }

      eventBus.emit('completed');
    } catch {
      eventBus.emit('failed');
    }
  }

  async function readCloudBlob(key: string): Promise<PartitionBlob | null> {
    try {
      return await readJson<PartitionBlob>(cloudAdapter, cloudMeta, key, deserialize);
    } catch {
      return null;
    }
  }

  // ---- Public API ----

  const hydrate = (): Promise<void> =>
    scheduler.schedule(() => hydrateImpl());

  const sync = (): Promise<void> =>
    scheduler.schedule(() => syncBidirectional());

  function startPeriodicSync(): void {
    if (periodicTimer || disposed) return;
    periodicTimer = setInterval(() => { void sync(); }, periodicIntervalMs);
  }

  function stopPeriodicSync(): void {
    if (periodicTimer) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
  }

  const isDirty = (): boolean => dirtyKeys.size > 0;

  const isDirty$ = dirtySubject.asObservable().pipe(distinctUntilChanged());

  function onEvent(type: SyncEventType, listener: () => void): void {
    eventBus.on(type, listener);
  }

  function offEvent(type: SyncEventType, listener: () => void): void {
    eventBus.off(type, listener);
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    stopPeriodicSync();
    // Wait for in-flight sync
    await scheduler.schedule(async () => {
      await flushToLocal();
    });
    scheduler.dispose();
    eventBus.dispose();
    dirtySubject.complete();
  }

  return {
    hydrate,
    sync,
    startPeriodicSync,
    stopPeriodicSync,
    isDirty,
    isDirty$,
    onEvent,
    offEvent,
    dispose,
  };
}
