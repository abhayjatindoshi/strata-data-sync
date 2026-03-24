import type { SyncEvent, SyncEventEmitter, SyncEventListener } from './types';

export function createSyncEventEmitter(): SyncEventEmitter {
  const listeners: SyncEventListener[] = [];

  return {
    on(listener) {
      listeners.push(listener);
    },
    off(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },
    emit(event) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}
