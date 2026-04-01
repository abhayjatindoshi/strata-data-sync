import type { Hlc } from '@strata/hlc';
import type { Tenant } from '@strata/adapter';
import type { PartitionBlob } from '@strata/persistence';
import { partitionHash } from '@strata/persistence';
import { parseCompositeKey } from '@strata/utils';
import type { ResolvedStrataOptions } from '../options';
import type { EntityStore } from './types';

export class Store implements EntityStore {
  readonly kind = 'blob' as const;
  private readonly partitions = new Map<string, Map<string, unknown>>();
  private readonly tombstones = new Map<string, Map<string, Hlc>>();
  private readonly dirtyKeys = new Set<string>();
  private readonly markerKey: string;
  private storedMarkerBlob: PartitionBlob | null = null;

  constructor(options: ResolvedStrataOptions) {
    this.markerKey = options.markerKey;
  }

  getEntity(entityKey: string, id: string): unknown | undefined {
    return this.partitions.get(entityKey)?.get(id);
  }

  setEntity(entityKey: string, id: string, entity: unknown): void {
    let partition = this.partitions.get(entityKey);
    if (!partition) {
      partition = new Map();
      this.partitions.set(entityKey, partition);
    }
    partition.set(id, entity);
    this.dirtyKeys.add(entityKey);
  }

  deleteEntity(entityKey: string, id: string): boolean {
    const partition = this.partitions.get(entityKey);
    if (!partition) return false;
    const deleted = partition.delete(id);
    if (deleted) {
      this.dirtyKeys.add(entityKey);
    }
    return deleted;
  }

  getPartition(entityKey: string): ReadonlyMap<string, unknown> {
    return this.partitions.get(entityKey) ?? new Map<string, unknown>();
  }

  getAllPartitionKeys(entityName: string): ReadonlyArray<string> {
    const prefix = `${entityName}.`;
    const keys: string[] = [];
    for (const key of this.partitions.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  getDirtyKeys(): ReadonlySet<string> {
    return this.dirtyKeys;
  }

  clearDirty(entityKey: string): void {
    this.dirtyKeys.delete(entityKey);
  }

  async loadPartition(
    entityKey: string,
    loader: () => Promise<Map<string, unknown>>,
  ): Promise<ReadonlyMap<string, unknown>> {
    if (!this.partitions.has(entityKey)) {
      const data = await loader();
      this.partitions.set(entityKey, data);
    }
    return this.partitions.get(entityKey)!;
  }

  setTombstone(entityKey: string, entityId: string, hlc: Hlc): void {
    let partition = this.tombstones.get(entityKey);
    if (!partition) {
      partition = new Map();
      this.tombstones.set(entityKey, partition);
    }
    partition.set(entityId, hlc);
    this.dirtyKeys.add(entityKey);
  }

  getTombstones(entityKey: string): ReadonlyMap<string, Hlc> {
    return this.tombstones.get(entityKey) ?? new Map<string, Hlc>();
  }

  clear(): void {
    this.partitions.clear();
    this.tombstones.clear();
    this.dirtyKeys.clear();
    this.storedMarkerBlob = null;
  }

  // ─── BlobAdapter interface ─────────────────────────────

  async read(_tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null> {
    if (key === this.markerKey) {
      return this.buildMarkerBlob();
    }
    const parsed = parseCompositeKey(key);
    if (!parsed) return null;
    const entityName = parsed.entityName;
    const partition = this.getPartition(key);
    if (partition.size === 0 && this.getTombstones(key).size === 0) {
      return null;
    }
    const entities: Record<string, unknown> = {};
    for (const [id, entity] of partition) {
      entities[id] = entity;
    }
    const tombstoneEntries: Record<string, Hlc> = {};
    for (const [id, hlc] of this.getTombstones(key)) {
      tombstoneEntries[id] = hlc;
    }
    return {
      [entityName]: entities,
      deleted: { [entityName]: tombstoneEntries },
    };
  }

  async write(_tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void> {
    if (key === this.markerKey) {
      this.storedMarkerBlob = data;
      return;
    }
    const parsed = parseCompositeKey(key);
    if (!parsed) return;
    const entityName = parsed.entityName;
    const entities =
      (data[entityName] as Record<string, unknown> | undefined) ?? {};
    const deletedSection = data['deleted'] as Record<string, Record<string, Hlc>> | undefined;
    const tombstoneData = deletedSection?.[entityName] ?? {};

    const partition = new Map<string, unknown>();
    for (const [id, entity] of Object.entries(entities)) {
      partition.set(id, entity);
    }
    this.partitions.set(key, partition);

    const tombstoneMap = new Map<string, Hlc>();
    for (const [id, hlc] of Object.entries(tombstoneData)) {
      tombstoneMap.set(id, hlc);
    }
    this.tombstones.set(key, tombstoneMap);
  }

  async delete(_tenant: Tenant | undefined, key: string): Promise<boolean> {
    const had = this.partitions.has(key) || this.tombstones.has(key);
    this.partitions.delete(key);
    this.tombstones.delete(key);
    return had;
  }

  async list(_tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.partitions.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  private buildMarkerBlob(): PartitionBlob {
    const indexes: Record<string, Record<string, { hash: number; count: number; deletedCount: number; updatedAt: number }>> = {};
    for (const entityKey of this.partitions.keys()) {
      const parsed = parseCompositeKey(entityKey);
      if (!parsed) continue;
      const entityName = parsed.entityName;
      const partitionKey = parsed.rest;

      if (!indexes[entityName]) indexes[entityName] = {};

      const partition = this.getPartition(entityKey);
      const tombstoneMap = this.getTombstones(entityKey);
      const hlcMap = new Map<string, Hlc>();
      for (const [id, entity] of partition) {
        const hlc = (entity as { hlc?: Hlc }).hlc;
        if (hlc) hlcMap.set(id, hlc);
      }
      for (const [id, hlc] of tombstoneMap) {
        hlcMap.set(`\0${id}`, hlc);
      }

      indexes[entityName][partitionKey] = {
        hash: partitionHash(hlcMap),
        count: hlcMap.size,
        deletedCount: tombstoneMap.size,
        updatedAt: Date.now(),
      };
    }

    return {
      __system: {
        marker: {
          version: 1,
          createdAt: new Date(),
          entityTypes: [],
          indexes,
        },
      },
      deleted: {},
    };
  }
}
