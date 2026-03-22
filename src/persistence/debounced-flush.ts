export type DebouncedFlush = {
  readonly trigger: () => void;
  readonly flush: () => Promise<void>;
  readonly dispose: () => Promise<void>;
};

export function createDebouncedFlush(
  flushFn: () => Promise<void>,
  delayMs = 2000,
): DebouncedFlush {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function trigger(): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void flushFn();
    }, delayMs);
  }

  async function flush(): Promise<void> {
    clearTimer();
    await flushFn();
  }

  async function dispose(): Promise<void> {
    clearTimer();
    await flushFn();
  }

  return { trigger, flush, dispose };
}
