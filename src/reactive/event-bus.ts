import type { EntityEventBus, EntityEventListener, EntityEvent } from './types';

export class EventBus implements EntityEventBus {
  private readonly listeners: EntityEventListener[] = [];

  on(listener: EntityEventListener): void {
    this.listeners.push(listener);
  }

  off(listener: EntityEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  emit(event: EntityEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

export function createEventBus(): EntityEventBus {
  return new EventBus();
}
