export type {
  SyncDirection,
  PartitionMeta,
  EntityHlc,
  EntityMetadataMap,
  MetadataDiffResult,
  EntityDiffEntry,
  DeepDiffResult,
  MergeResult,
  SyncEntity,
  ApplyResult,
  SyncResult,
  DirtyTracker,
  SyncTask,
  SyncScheduler,
} from './sync-types';

export { compareEntityHlc, resolveConflict } from './conflict-resolution';
export { metadataDiff } from './metadata-diff';
export { deepDiff } from './deep-diff';
export { mergePartitionEntities, recomputeMetadata } from './sync-apply';
export { isStale } from './stale-check';
export { createDirtyTracker } from './dirty-tracker';
export { createSyncScheduler } from './sync-scheduler';
