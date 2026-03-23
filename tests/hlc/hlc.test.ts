import { describe, it, expect } from 'vitest';
import { createHlc, tickLocal, tickRemote, compareHlc } from '@strata/hlc/hlc.js';

describe('createHlc', () => {
  it('creates an HLC with current timestamp', () => {
    const before = Date.now();
    const hlc = createHlc('node1');
    const after = Date.now();

    expect(hlc.timestamp).toBeGreaterThanOrEqual(before);
    expect(hlc.timestamp).toBeLessThanOrEqual(after);
    expect(hlc.counter).toBe(0);
    expect(hlc.nodeId).toBe('node1');
  });
});

describe('tickLocal', () => {
  it('advances to wall clock when wall clock is ahead', () => {
    const old = { timestamp: Date.now() - 1000, counter: 5, nodeId: 'node1' };
    const result = tickLocal(old);

    expect(result.timestamp).toBeGreaterThan(old.timestamp);
    expect(result.counter).toBe(0);
    expect(result.nodeId).toBe('node1');
  });

  it('increments counter when wall clock has not advanced', () => {
    const future = { timestamp: Date.now() + 60_000, counter: 3, nodeId: 'node1' };
    const result = tickLocal(future);

    expect(result.timestamp).toBe(future.timestamp);
    expect(result.counter).toBe(4);
    expect(result.nodeId).toBe('node1');
  });
});

describe('tickRemote', () => {
  it('uses wall clock when it is the max', () => {
    const local = { timestamp: Date.now() - 2000, counter: 1, nodeId: 'A' };
    const remote = { timestamp: Date.now() - 1000, counter: 2, nodeId: 'B' };
    const result = tickRemote(local, remote);

    expect(result.timestamp).toBeGreaterThanOrEqual(Date.now() - 1);
    expect(result.counter).toBe(0);
    expect(result.nodeId).toBe('A');
  });

  it('uses local timestamp when it is the max', () => {
    const local = { timestamp: Date.now() + 60_000, counter: 5, nodeId: 'A' };
    const remote = { timestamp: Date.now() - 1000, counter: 2, nodeId: 'B' };
    const result = tickRemote(local, remote);

    expect(result.timestamp).toBe(local.timestamp);
    expect(result.counter).toBe(6);
    expect(result.nodeId).toBe('A');
  });

  it('uses remote timestamp when it is the max', () => {
    const local = { timestamp: Date.now() - 1000, counter: 2, nodeId: 'A' };
    const remote = { timestamp: Date.now() + 60_000, counter: 5, nodeId: 'B' };
    const result = tickRemote(local, remote);

    expect(result.timestamp).toBe(remote.timestamp);
    expect(result.counter).toBe(6);
    expect(result.nodeId).toBe('A');
  });

  it('merges counters when both timestamps are equal and max', () => {
    const ts = Date.now() + 60_000;
    const local = { timestamp: ts, counter: 3, nodeId: 'A' };
    const remote = { timestamp: ts, counter: 7, nodeId: 'B' };
    const result = tickRemote(local, remote);

    expect(result.timestamp).toBe(ts);
    expect(result.counter).toBe(8);
    expect(result.nodeId).toBe('A');
  });
});

describe('compareHlc', () => {
  it('orders by timestamp first', () => {
    const a = { timestamp: 100, counter: 5, nodeId: 'B' };
    const b = { timestamp: 200, counter: 0, nodeId: 'A' };
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);
  });

  it('orders by counter when timestamps are equal', () => {
    const a = { timestamp: 100, counter: 1, nodeId: 'B' };
    const b = { timestamp: 100, counter: 5, nodeId: 'A' };
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);
  });

  it('orders by nodeId when timestamp and counter are equal', () => {
    const a = { timestamp: 100, counter: 1, nodeId: 'A' };
    const b = { timestamp: 100, counter: 1, nodeId: 'B' };
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);
  });

  it('returns 0 for identical HLCs', () => {
    const a = { timestamp: 100, counter: 1, nodeId: 'A' };
    expect(compareHlc(a, a)).toBe(0);
  });
});
