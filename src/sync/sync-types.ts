export type SyncDirection = 'store-to-local' | 'local-to-cloud';

export type PartitionMeta = {
  readonly hash: number;
  readonly updatedAt: number;
};

export type EntityHlc = {
  readonly updatedAt: number;
  readonly version: number;
  readonly device: string;
  readonly deleted?: boolean;
};

export type EntityMetadataMap = Readonly<Record<string, EntityHlc>>;

export type MetadataDiffResult = {
  readonly aOnly: readonly string[];
  readonly bOnly: readonly string[];
  readonly mismatched: readonly string[];
};

export type EntityDiffEntry = {
  readonly id: string;
  readonly direction: 'a-to-b' | 'b-to-a';
};

export type DeepDiffResult = {
  readonly oneWayCopy?: 'a-to-b' | 'b-to-a';
  readonly entries: readonly EntityDiffEntry[];
};

export type MergeResult = {
  readonly winner: 'a' | 'b' | 'equal';
  readonly deleted: boolean;
};

export type SyncEntity = Readonly<Record<string, unknown>> & {
  readonly id: string;
};

export type ApplyResult = {
  readonly merged: readonly SyncEntity[];
  readonly deletedIds: readonly string[];
  readonly conflictsResolved: number;
};

export type SyncResult = {
  readonly partitionsSynced: number;
  readonly entitiesCopied: number;
  readonly conflictsResolved: number;
  readonly skippedStale: boolean;
};

export type DirtyTracker = {
  readonly markDirty: (entityKey: string) => void;
  readonly isDirty: (entityKey: string) => boolean;
  readonly getDirtyPartitions: () => readonly string[];
  readonly clear: (entityKey: string) => void;
  readonly clearAll: () => void;
  readonly version: () => number;
};

export type SyncTask = {
  readonly direction: SyncDirection;
  readonly entityKey: string;
};

export type SyncScheduler = {
  readonly schedule: (direction: SyncDirection, entityKey: string) => void;
  readonly flush: () => readonly SyncTask[];
  readonly pending: () => number;
};
