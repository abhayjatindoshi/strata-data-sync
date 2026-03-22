import type { DirtyTracker } from './sync-types';

export function createDirtyTracker(): DirtyTracker {
  const dirty = new Set<string>();
  let ver = 0;

  return {
    markDirty(entityKey: string): void {
      dirty.add(entityKey);
      ver++;
    },
    isDirty(entityKey: string): boolean {
      return dirty.has(entityKey);
    },
    getDirtyPartitions(): readonly string[] {
      return [...dirty];
    },
    clear(entityKey: string): void {
      dirty.delete(entityKey);
    },
    clearAll(): void {
      dirty.clear();
    },
    version(): number {
      return ver;
    },
  };
}
