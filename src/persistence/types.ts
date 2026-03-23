export type PartitionIndexEntry = {
  readonly hash: number;
  readonly count: number;
  readonly updatedAt: number;
};

export type PartitionIndex = Record<string, PartitionIndexEntry>;
