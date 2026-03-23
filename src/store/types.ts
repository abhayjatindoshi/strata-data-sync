export type EntityStore = {
  get(entityKey: string, id: string): unknown | undefined;
  set(entityKey: string, id: string, entity: unknown): void;
  delete(entityKey: string, id: string): boolean;
  getPartition(entityKey: string): ReadonlyMap<string, unknown>;
  getAllPartitionKeys(entityName: string): ReadonlyArray<string>;
  getDirtyKeys(): ReadonlySet<string>;
  clearDirty(entityKey: string): void;
  loadPartition(
    entityKey: string,
    loader: () => Promise<Map<string, unknown>>,
  ): Promise<ReadonlyMap<string, unknown>>;
};
