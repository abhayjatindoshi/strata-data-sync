import type { Hlc } from '@strata/hlc';
import type { Tenant } from '@strata/adapter';
import type { Observable } from 'rxjs';
import type { ReactiveFlag } from '@strata/utils';

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
  run(
    tenant: Tenant | undefined,
    steps: ReadonlyArray<[SyncLocation, SyncLocation]>,
  ): Promise<SyncBetweenResult[]>;
  startScheduler(
    tenant: Tenant | undefined,
    hasCloud: boolean,
    dirtyTracker?: ReactiveFlag,
  ): void;
  stopScheduler(): void;
  emit(event: SyncEvent): void;
  syncEvents$: Observable<SyncEvent>;
  drain(): Promise<void>;
  dispose(): void;
};
