export type PartitionIndexEntry = {
  readonly hash: number;
  readonly count: number;
  readonly deletedCount: number;
  readonly updatedAt: number;
};

export type PartitionIndex = Record<string, PartitionIndexEntry>;

export type AllIndexes = Record<string, PartitionIndex>;
