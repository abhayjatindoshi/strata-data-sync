import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '@strata/reactive/event-bus.js';

describe('createEventBus', () => {
  it('should call listener on emit', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('test', listener);
    bus.emit('test');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not call removed listener', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('test', listener);
    bus.off('test', listener);
    bus.emit('test');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners', () => {
    const bus = createEventBus();
    const l1 = vi.fn();
    const l2 = vi.fn();
    bus.on('test', l1);
    bus.on('test', l2);
    bus.emit('test');
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it('should not call listeners for different types', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('a', listener);
    bus.emit('b');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should clear all listeners on dispose', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('test', listener);
    bus.dispose();
    bus.emit('test');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle emit when no listeners registered', () => {
    const bus = createEventBus();
    expect(() => bus.emit('nonexistent')).not.toThrow();
  });

  it('should handle off for non-registered listener', () => {
    const bus = createEventBus();
    expect(() => bus.off('test', vi.fn())).not.toThrow();
  });
});
