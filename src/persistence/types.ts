import type { Hlc } from '@strata/hlc';
import type { Tenant } from '@strata/adapter';

export type PartitionIndexEntry = {
  readonly hash: number;
  readonly count: number;
  readonly deletedCount: number;
  readonly updatedAt: number;
};

export type PartitionIndex = Record<string, PartitionIndexEntry>;

export type AllIndexes = Record<string, PartitionIndex>;

export type PartitionBlob = {
  readonly deleted: Record<string, Record<string, Hlc>>;
  readonly [entityName: string]: Record<string, unknown> | Record<string, Record<string, Hlc>>;
};

export type TenantListBlob = ReadonlyArray<Tenant>;
