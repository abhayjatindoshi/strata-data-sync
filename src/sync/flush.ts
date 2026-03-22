import type { PartitionBlob } from '../persistence/index.js';
import { createDebouncedFlush } from '../persistence/index.js';
import type { FlushMechanism } from './types.js';

export function createFlushMechanism(
  getBlob: (entityKey: string) => PartitionBlob,
  writeBlob: (entityKey: string, blob: PartitionBlob) => Promise<void>,
  delayMs?: number,
): FlushMechanism {
  const dirtyKeys = new Set<string>();

  async function performFlush(): Promise<void> {
    const keys = [...dirtyKeys];
    dirtyKeys.clear();
    for (const key of keys) {
      await writeBlob(key, getBlob(key));
    }
  }

  const debounced = createDebouncedFlush(performFlush, delayMs);

  const markDirty = (entityKey: string): void => {
    dirtyKeys.add(entityKey);
    debounced.trigger();
  };

  return {
    markDirty,
    flush: debounced.flush,
    dispose: debounced.dispose,
  };
}
