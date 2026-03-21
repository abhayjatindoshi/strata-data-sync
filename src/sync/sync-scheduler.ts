import type { SyncDirection, SyncTask, SyncScheduler } from './sync-types.js';

export function createSyncScheduler(): SyncScheduler {
  const queue = new Map<string, SyncTask>();

  return {
    schedule(direction: SyncDirection, entityKey: string): void {
      const key = `${direction}:${entityKey}`;
      if (!queue.has(key)) {
        queue.set(key, { direction, entityKey });
      }
    },
    flush(): readonly SyncTask[] {
      const tasks = [...queue.values()];
      queue.clear();
      return tasks;
    },
    pending(): number {
      return queue.size;
    },
  };
}
