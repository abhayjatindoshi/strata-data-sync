import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHlc, tickLocal, tickRemote, compareHlc } from './hlc';
import type { Hlc } from './hlc';

describe('createHlc', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('initializes with current time, counter 0, and nodeId', () => {
    vi.setSystemTime(1000);
    const hlc = createHlc('node-1');
    expect(hlc).toEqual({ timestamp: 1000, counter: 0, nodeId: 'node-1' });
  });
});

describe('tickLocal', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('advances timestamp when wall clock moves forward', () => {
    vi.setSystemTime(1000);
    const hlc = createHlc('node-1');
    vi.setSystemTime(2000);
    const next = tickLocal(hlc);
    expect(next.timestamp).toBe(2000);
    expect(next.counter).toBe(0);
    expect(next.nodeId).toBe('node-1');
  });

  it('increments counter when wall clock has not advanced', () => {
    vi.setSystemTime(1000);
    const hlc = createHlc('node-1');
    const next = tickLocal(hlc);
    expect(next.timestamp).toBe(1000);
    expect(next.counter).toBe(1);
  });

  it('increments counter when wall clock is behind', () => {
    const hlc: Hlc = { timestamp: 5000, counter: 3, nodeId: 'node-1' };
    vi.setSystemTime(1000);
    const next = tickLocal(hlc);
    expect(next.timestamp).toBe(5000);
    expect(next.counter).toBe(4);
  });
});

describe('tickRemote', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('advances to remote timestamp when remote is ahead', () => {
    vi.setSystemTime(1000);
    const local: Hlc = { timestamp: 1000, counter: 0, nodeId: 'node-1' };
    const remote: Hlc = { timestamp: 3000, counter: 5, nodeId: 'node-2' };
    const result = tickRemote(local, remote);
    expect(result.timestamp).toBe(3000);
    expect(result.counter).toBe(6);
    expect(result.nodeId).toBe('node-1');
  });

  it('takes max counter + 1 when both timestamps equal', () => {
    vi.setSystemTime(1000);
    const local: Hlc = { timestamp: 2000, counter: 3, nodeId: 'node-1' };
    const remote: Hlc = { timestamp: 2000, counter: 7, nodeId: 'node-2' };
    const result = tickRemote(local, remote);
    expect(result.timestamp).toBe(2000);
    expect(result.counter).toBe(8);
  });

  it('resets counter when wall clock is ahead of both', () => {
    vi.setSystemTime(5000);
    const local: Hlc = { timestamp: 1000, counter: 3, nodeId: 'node-1' };
    const remote: Hlc = { timestamp: 2000, counter: 7, nodeId: 'node-2' };
    const result = tickRemote(local, remote);
    expect(result.timestamp).toBe(5000);
    expect(result.counter).toBe(0);
  });

  it('increments local counter when local timestamp is highest', () => {
    vi.setSystemTime(1000);
    const local: Hlc = { timestamp: 5000, counter: 2, nodeId: 'node-1' };
    const remote: Hlc = { timestamp: 3000, counter: 7, nodeId: 'node-2' };
    const result = tickRemote(local, remote);
    expect(result.timestamp).toBe(5000);
    expect(result.counter).toBe(3);
  });
});

describe('compareHlc', () => {
  it('orders by timestamp first', () => {
    const a: Hlc = { timestamp: 1000, counter: 5, nodeId: 'z' };
    const b: Hlc = { timestamp: 2000, counter: 0, nodeId: 'a' };
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, a)).toBe(1);
  });

  it('orders by counter when timestamps equal', () => {
    const a: Hlc = { timestamp: 1000, counter: 1, nodeId: 'z' };
    const b: Hlc = { timestamp: 1000, counter: 2, nodeId: 'a' };
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, a)).toBe(1);
  });

  it('orders by nodeId when timestamp and counter equal', () => {
    const a: Hlc = { timestamp: 1000, counter: 1, nodeId: 'alpha' };
    const b: Hlc = { timestamp: 1000, counter: 1, nodeId: 'beta' };
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, a)).toBe(1);
  });

  it('returns 0 for identical HLCs', () => {
    const a: Hlc = { timestamp: 1000, counter: 1, nodeId: 'node-1' };
    const b: Hlc = { timestamp: 1000, counter: 1, nodeId: 'node-1' };
    expect(compareHlc(a, b)).toBe(0);
  });
});
