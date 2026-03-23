import type { BaseEntity } from '@strata/entity';

export type PartitionLoader = (
  entityKey: string,
) => Promise<ReadonlyArray<BaseEntity>>;

export type EntityStore = {
  readonly save: (entityKey: string, entity: BaseEntity) => void;
  readonly saveMany: (
    entityKey: string,
    entities: ReadonlyArray<BaseEntity>,
  ) => void;
  readonly delete: (entityKey: string, id: string) => void;
  readonly deleteMany: (
    entityKey: string,
    ids: ReadonlyArray<string>,
  ) => void;
  readonly get: (entityKey: string, id: string) => BaseEntity | undefined;
  readonly getAll: (entityKey: string) => ReadonlyArray<BaseEntity>;
  readonly listPartitions: (entityName: string) => ReadonlyArray<string>;
  readonly hasPartition: (entityKey: string) => boolean;
};
