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
} from './sync-types.js';

export { compareEntityHlc, resolveConflict } from './conflict-resolution.js';
export { metadataDiff } from './metadata-diff.js';
export { deepDiff } from './deep-diff.js';
export { mergePartitionEntities, recomputeMetadata } from './sync-apply.js';
export { isStale } from './stale-check.js';
export { createDirtyTracker } from './dirty-tracker.js';
export { createSyncScheduler } from './sync-scheduler.js';
