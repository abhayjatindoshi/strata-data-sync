import { describe, it, expect } from 'vitest';
import { createChangeSignal } from './change-signal.js';

describe('createChangeSignal', () => {
  it('should emit on notify', () => {
    const signal = createChangeSignal();
    let count = 0;
    signal.observe$.subscribe(() => count++);
    signal.notify();
    signal.notify();
    expect(count).toBe(2);
  });

  it('should complete on dispose', () => {
    const signal = createChangeSignal();
    let completed = false;
    signal.observe$.subscribe({
      complete: () => {
        completed = true;
      },
    });
    signal.dispose();
    expect(completed).toBe(true);
  });

  it('should not emit after dispose', () => {
    const signal = createChangeSignal();
    let count = 0;
    signal.observe$.subscribe(() => count++);
    signal.dispose();
    signal.notify();
    expect(count).toBe(0);
  });
});
