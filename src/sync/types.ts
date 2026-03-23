import type { Hlc } from '@strata/hlc';

export type PartitionDiffResult = {
  readonly localOnly: ReadonlyArray<string>;
  readonly cloudOnly: ReadonlyArray<string>;
  readonly diverged: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
};

export type EntityDiffResult = {
  readonly localOnly: ReadonlyArray<string>;
  readonly cloudOnly: ReadonlyArray<string>;
  readonly both: ReadonlyArray<string>;
};

export type MergeResult = {
  readonly entities: Readonly<Record<string, unknown>>;
  readonly tombstones: Readonly<Record<string, Hlc>>;
};

export type MergedPartitionResult = MergeResult & {
  readonly partitionKey: string;
};

export type SyncEntity = {
  readonly hlc: Hlc;
};
