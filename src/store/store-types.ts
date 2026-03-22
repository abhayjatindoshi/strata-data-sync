import type { BaseEntity } from '@strata/entity';

export type StoreEntry = BaseEntity & Readonly<Record<string, unknown>>;

export type PartitionMap = ReadonlyMap<string, StoreEntry>;

export type StoreOptions = {
  readonly onPartitionCreated?: (entityKey: string) => void;
  readonly onEntitySaved?: (entityKey: string, entity: StoreEntry, isNew: boolean) => void;
  readonly onEntityDeleted?: (entityKey: string, id: string) => void;
};

export type EntityStore = {
  readonly createPartition: (entityKey: string) => void;
  readonly getPartition: (entityKey: string) => PartitionMap | undefined;
  readonly listPartitions: (entityName: string) => readonly string[];
  readonly deletePartition: (entityKey: string) => boolean;
  readonly hasPartition: (entityKey: string) => boolean;

  readonly get: (entityKey: string, id: string) => StoreEntry | undefined;
  readonly getAll: (entityKey: string) => readonly StoreEntry[];
  readonly save: (entityKey: string, entity: StoreEntry) => void;
  readonly delete: (entityKey: string, id: string) => boolean;

  readonly getById: (id: string) => StoreEntry | undefined;
};
