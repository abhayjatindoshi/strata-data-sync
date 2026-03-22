export type BaseEntityHlc = {
  readonly timestamp: number;
  readonly counter: number;
  readonly nodeId: string;
};

export type BaseEntity = {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly device: string;
  readonly hlc: BaseEntityHlc;
};

export type ParsedEntityId = {
  readonly entityName: string;
  readonly partitionKey: string;
  readonly uniqueId: string;
};

export type DeriveIdFn<T> = (entity: T) => string;
