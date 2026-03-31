import type { Hlc } from '@strata/hlc';
import type { Tenant } from '@strata/adapter';

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

export type SyncEntityChange = {
  readonly key: string;
  readonly updatedIds: ReadonlyArray<string>;
  readonly deletedIds: ReadonlyArray<string>;
};

export type SyncBetweenResult = {
  readonly changesForA: ReadonlyArray<SyncEntityChange>;
  readonly changesForB: ReadonlyArray<SyncEntityChange>;
  readonly stale: boolean;
  readonly maxHlc: Hlc | undefined;
};

export type SyncLocation = 'memory' | 'local' | 'cloud';

export type SyncQueueItem = {
  readonly source: SyncLocation;
  readonly target: SyncLocation;
  readonly fn: () => Promise<void>;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (err: Error) => void;
};

export type SyncResult = {
  readonly entitiesUpdated: number;
  readonly conflictsResolved: number;
  readonly partitionsSynced: number;
};

export type SyncEvent =
  | { readonly type: 'sync-started'; readonly source: SyncLocation; readonly target: SyncLocation }
  | { readonly type: 'sync-completed'; readonly source: SyncLocation; readonly target: SyncLocation; readonly result: SyncResult }
  | { readonly type: 'sync-failed'; readonly source: SyncLocation; readonly target: SyncLocation; readonly error: Error }
  | { readonly type: 'cloud-unreachable' };

export type SyncEventListener = (event: SyncEvent) => void;

export type SyncEnqueueResult = {
  readonly result: SyncBetweenResult;
  readonly deduplicated: boolean;
};

export type SyncEngine = {
  sync(
    source: SyncLocation,
    target: SyncLocation,
    tenant: Tenant | undefined,
  ): Promise<SyncEnqueueResult>;
  emit(event: SyncEvent): void;
  on(listener: SyncEventListener): void;
  off(listener: SyncEventListener): void;
  drain(): Promise<void>;
  dispose(): void;
};

export type SyncSchedulerOptions = {
  readonly localFlushIntervalMs: number;
  readonly cloudSyncIntervalMs: number;
  readonly dirtyTracker?: DirtyTracker;
};

export type SyncScheduler = {
  start(): void;
  stop(): void;
};

export type DirtyTracker = {
  readonly isDirty: boolean;
  readonly isDirty$: import('rxjs').Observable<boolean>;
  markDirty(): void;
  clearDirty(): void;
};
