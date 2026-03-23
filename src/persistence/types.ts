import type { BaseEntityHlc } from '@strata/entity';

export type TypeMarker = {
  readonly __t: string;
  readonly v: unknown;
};

export type PartitionIndexEntry = {
  readonly hash: number;
  readonly count: number;
  readonly updatedAt: string;
};

export type PartitionIndex = Record<string, PartitionIndexEntry>;

export type Tombstone = {
  readonly id: string;
  readonly hlc: BaseEntityHlc;
  readonly deletedAt: string;
};

export type PartitionBlob = {
  readonly entities: Record<string, unknown>;
  readonly deleted: Record<string, Tombstone>;
};
