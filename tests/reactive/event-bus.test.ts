import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '@strata/reactive';

describe('EventBus', () => {
  it('on/emit delivers events to listener', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on(listener);
    bus.emit({ entityName: 'transaction' });
    expect(listener).toHaveBeenCalledWith({ entityName: 'transaction' });
  });

  it('off removes listener', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on(listener);
    bus.off(listener);
    bus.emit({ entityName: 'transaction' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners all fire', () => {
    const bus = createEventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    bus.on(listener1);
    bus.on(listener2);
    bus.emit({ entityName: 'transaction' });
    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it('emit with no listeners is safe', () => {
    const bus = createEventBus();
    expect(() => bus.emit({ entityName: 'transaction' })).not.toThrow();
  });

  it('off with unregistered listener is a no-op', () => {
    const bus = createEventBus();
    const unregistered = vi.fn();
    bus.off(unregistered);
    bus.emit({ entityName: 'transaction' });
    expect(unregistered).not.toHaveBeenCalled();
  });

  it('same listener registered twice fires twice', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on(listener);
    bus.on(listener);
    bus.emit({ entityName: 'transaction' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
