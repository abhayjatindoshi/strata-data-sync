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

export type SyncDirection =
  | 'memory-to-local'
  | 'local-to-cloud'
  | 'cloud-to-local'
  | 'cloud-to-memory';

export type SyncQueueItem = {
  readonly source: SyncDirection;
  readonly target: SyncDirection;
  readonly fn: () => Promise<void>;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (err: Error) => void;
};

export type SyncLock = {
  enqueue(
    source: SyncDirection,
    target: SyncDirection,
    fn: () => Promise<void>,
  ): Promise<void>;
  isRunning(): boolean;
  drain(): Promise<void>;
  dispose(): void;
};

export type SyncResult = {
  readonly entitiesUpdated: number;
  readonly conflictsResolved: number;
  readonly partitionsSynced: number;
};

export type SyncEvent =
  | { readonly type: 'sync-started' }
  | { readonly type: 'sync-completed'; readonly result: SyncResult }
  | { readonly type: 'sync-failed'; readonly error: Error }
  | { readonly type: 'cloud-unreachable' };

export type SyncEventListener = (event: SyncEvent) => void;

export type SyncEventEmitter = {
  on(listener: SyncEventListener): void;
  off(listener: SyncEventListener): void;
  emit(event: SyncEvent): void;
};

export type SyncSchedulerOptions = {
  readonly localFlushIntervalMs?: number;
  readonly cloudSyncIntervalMs?: number;
  readonly dirtyTracker?: DirtyTracker;
  readonly syncEvents?: SyncEventEmitter;
};

export type SyncScheduler = {
  start(): void;
  stop(): void;
  dispose(): Promise<void>;
};

export type DirtyTracker = {
  readonly isDirty: boolean;
  readonly isDirty$: import('rxjs').Observable<boolean>;
  markDirty(): void;
  clearDirty(): void;
};
