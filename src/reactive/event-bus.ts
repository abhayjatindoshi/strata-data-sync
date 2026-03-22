export type EventBus = {
  readonly on: (type: string, listener: () => void) => void;
  readonly off: (type: string, listener: () => void) => void;
  readonly emit: (type: string) => void;
  readonly dispose: () => void;
};

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<() => void>>();

  function on(type: string, listener: () => void): void {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(listener);
  }

  function off(type: string, listener: () => void): void {
    listeners.get(type)?.delete(listener);
  }

  function emit(type: string): void {
    listeners.get(type)?.forEach(fn => fn());
  }

  function dispose(): void {
    listeners.clear();
  }

  return { on, off, emit, dispose };
}
