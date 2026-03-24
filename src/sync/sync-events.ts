import type { SyncEvent, SyncEventEmitter as SyncEventEmitterType, SyncEventListener } from './types';

export class SyncEventEmitter {
  private readonly listeners: SyncEventListener[] = [];

  on(listener: SyncEventListener): void {
    this.listeners.push(listener);
  }

  off(listener: SyncEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  emit(event: SyncEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

export function createSyncEventEmitter(): SyncEventEmitterType {
  return new SyncEventEmitter();
}
