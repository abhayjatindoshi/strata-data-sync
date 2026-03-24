import type { Hlc } from '@strata/hlc';
import type { EntityStore } from './types';

export class Store implements EntityStore {
  private readonly partitions = new Map<string, Map<string, unknown>>();
  private readonly tombstones = new Map<string, Map<string, Hlc>>();
  private readonly dirtyKeys = new Set<string>();

  get(entityKey: string, id: string): unknown | undefined {
    return this.partitions.get(entityKey)?.get(id);
  }

  set(entityKey: string, id: string, entity: unknown): void {
    let partition = this.partitions.get(entityKey);
    if (!partition) {
      partition = new Map();
      this.partitions.set(entityKey, partition);
    }
    partition.set(id, entity);
    this.dirtyKeys.add(entityKey);
  }

  delete(entityKey: string, id: string): boolean {
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
}

export function createStore(): EntityStore {
  return new Store();
}
