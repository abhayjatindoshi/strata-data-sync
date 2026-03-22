import type { Observable } from 'rxjs';
import type { BlobAdapter } from '../adapter/index.js';
import type { EntityStore } from '../store/index.js';

export type SyncScheduler = {
  readonly schedule: (fn: () => Promise<void>) => Promise<void>;
  readonly dispose: () => void;
};

export type PartitionDiff = {
  readonly added: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly changed: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
};

export type FlushMechanism = {
  readonly markDirty: (entityKey: string) => void;
  readonly flush: () => Promise<void>;
  readonly dispose: () => Promise<void>;
};

export type SyncEventType =
  | 'started'
  | 'completed'
  | 'failed'
  | 'cloud-unreachable';

export type SyncEngineConfig = {
  readonly localAdapter: BlobAdapter;
  readonly cloudAdapter: BlobAdapter;
  readonly store: EntityStore;
  readonly serialize: (data: unknown) => string;
  readonly deserialize: (json: string) => unknown;
  readonly computeHash: (entities: ReadonlyArray<{ readonly id: string; readonly hlc: { readonly timestamp: number; readonly counter: number; readonly nodeId: string }; readonly createdAt: Date; readonly updatedAt: Date; readonly version: number; readonly device: string }>) => number;
  readonly periodicIntervalMs?: number;
  readonly tombstoneRetentionDays?: number;
  readonly cloudMeta?: Readonly<Record<string, unknown>>;
};

export type SyncEngine = {
  readonly hydrate: () => Promise<void>;
  readonly sync: () => Promise<void>;
  readonly startPeriodicSync: () => void;
  readonly stopPeriodicSync: () => void;
  readonly markDirty: (entityKey: string) => void;
  readonly isDirty: () => boolean;
  readonly isDirty$: Observable<boolean>;
  readonly onEvent: (type: SyncEventType, listener: () => void) => void;
  readonly offEvent: (type: SyncEventType, listener: () => void) => void;
  readonly dispose: () => Promise<void>;
};
