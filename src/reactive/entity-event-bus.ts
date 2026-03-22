import type { EntityEvent, EntityEventListener } from './event-types';

export type EntityEventBus = {
  readonly emit: (event: EntityEvent) => void;
  readonly on: (listener: EntityEventListener) => void;
  readonly off: (listener: EntityEventListener) => void;
};

export function createEntityEventBus(): EntityEventBus {
  const listeners = new Set<EntityEventListener>();

  return {
    emit(event: EntityEvent): void {
      for (const listener of listeners) {
        listener(event);
      }
    },

    on(listener: EntityEventListener): void {
      listeners.add(listener);
    },

    off(listener: EntityEventListener): void {
      listeners.delete(listener);
    },
  };
}
