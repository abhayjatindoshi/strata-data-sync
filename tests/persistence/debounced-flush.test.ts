import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedFlush } from '@strata/persistence/debounced-flush.js';

describe('createDebouncedFlush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should call flush after delay on trigger', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const debounced = createDebouncedFlush(flushFn, 1000);

    debounced.trigger();
    expect(flushFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(flushFn).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on subsequent triggers', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const debounced = createDebouncedFlush(flushFn, 1000);

    debounced.trigger();
    await vi.advanceTimersByTimeAsync(500);
    debounced.trigger();
    await vi.advanceTimersByTimeAsync(500);
    expect(flushFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(flushFn).toHaveBeenCalledTimes(1);
  });

  it('should flush immediately on flush()', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const debounced = createDebouncedFlush(flushFn, 1000);

    debounced.trigger();
    await debounced.flush();
    expect(flushFn).toHaveBeenCalledTimes(1);
  });

  it('should flush immediately on dispose()', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const debounced = createDebouncedFlush(flushFn, 1000);

    debounced.trigger();
    await debounced.dispose();
    expect(flushFn).toHaveBeenCalledTimes(1);
  });

  it('should default to 2000ms delay', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const debounced = createDebouncedFlush(flushFn);

    debounced.trigger();
    await vi.advanceTimersByTimeAsync(1999);
    expect(flushFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(flushFn).toHaveBeenCalledTimes(1);
  });

  it('should cancel pending timer on flush', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const debounced = createDebouncedFlush(flushFn, 1000);

    debounced.trigger();
    await debounced.flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(flushFn).toHaveBeenCalledTimes(1);
  });
});
