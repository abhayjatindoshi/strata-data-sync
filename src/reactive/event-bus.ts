import type { EntityEventBus, EntityEventListener, EntityEvent } from './types';

export function createEventBus(): EntityEventBus {
  const listeners: EntityEventListener[] = [];

  return {
    on(listener: EntityEventListener) {
      listeners.push(listener);
    },
    off(listener: EntityEventListener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },
    emit(event: EntityEvent) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}
