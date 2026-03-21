import { describe, it, expect } from 'vitest';
import { createHlc, tickLocal, tickRemote, compareHlc } from '../../../src/hlc/index.js';
import type { Hlc } from '../../../src/hlc/index.js';

describe('Integration: HLC', () => {
  describe('createHlc', () => {
    it('should create an HLC with the given nodeId', () => {
      const hlc = createHlc('node-A');
      expect(hlc.nodeId).toBe('node-A');
      expect(hlc.counter).toBe(0);
      expect(hlc.timestamp).toBeGreaterThan(0);
      expect(hlc.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('tickLocal', () => {
    it('should advance the clock on local tick', () => {
      const hlc = createHlc('node-A');
      const ticked = tickLocal(hlc);

      expect(ticked.nodeId).toBe('node-A');
      expect(ticked.timestamp).toBeGreaterThanOrEqual(hlc.timestamp);
    });

    it('should increment counter when timestamp stays the same', () => {
      const hlc: Hlc = { timestamp: Number.MAX_SAFE_INTEGER, counter: 0, nodeId: 'node-A' };
      const ticked = tickLocal(hlc);

      expect(ticked.timestamp).toBe(Number.MAX_SAFE_INTEGER);
      expect(ticked.counter).toBe(1);
    });
  });

  describe('tickRemote', () => {
    it('should advance past a remote clock', () => {
      const local = createHlc('node-A');
      const remote: Hlc = {
        timestamp: Date.now() + 100000,
        counter: 5,
        nodeId: 'node-B',
      };

      const merged = tickRemote(local, remote);
      expect(merged.nodeId).toBe('node-A');
      expect(merged.timestamp).toBeGreaterThanOrEqual(remote.timestamp);
    });

    it('should increment counter when both timestamps match', () => {
      const ts = Date.now() + 999999;
      const local: Hlc = { timestamp: ts, counter: 3, nodeId: 'node-A' };
      const remote: Hlc = { timestamp: ts, counter: 7, nodeId: 'node-B' };

      const merged = tickRemote(local, remote);
      expect(merged.timestamp).toBe(ts);
      expect(merged.counter).toBe(8); // max(3,7) + 1
      expect(merged.nodeId).toBe('node-A');
    });

    it('should use local counter+1 when local timestamp is highest', () => {
      const local: Hlc = { timestamp: Date.now() + 999999, counter: 4, nodeId: 'A' };
      const remote: Hlc = { timestamp: Date.now() - 100000, counter: 100, nodeId: 'B' };

      const merged = tickRemote(local, remote);
      expect(merged.timestamp).toBe(local.timestamp);
      expect(merged.counter).toBe(5); // local.counter + 1
    });
  });

  describe('compareHlc', () => {
    it('should order by timestamp first', () => {
      const a: Hlc = { timestamp: 100, counter: 0, nodeId: 'A' };
      const b: Hlc = { timestamp: 200, counter: 0, nodeId: 'A' };

      expect(compareHlc(a, b)).toBe(-1);
      expect(compareHlc(b, a)).toBe(1);
    });

    it('should order by counter when timestamps equal', () => {
      const a: Hlc = { timestamp: 100, counter: 1, nodeId: 'A' };
      const b: Hlc = { timestamp: 100, counter: 5, nodeId: 'A' };

      expect(compareHlc(a, b)).toBe(-1);
      expect(compareHlc(b, a)).toBe(1);
    });

    it('should order by nodeId when timestamp and counter equal', () => {
      const a: Hlc = { timestamp: 100, counter: 0, nodeId: 'A' };
      const b: Hlc = { timestamp: 100, counter: 0, nodeId: 'B' };

      expect(compareHlc(a, b)).toBe(-1);
      expect(compareHlc(b, a)).toBe(1);
    });

    it('should return 0 for identical HLCs', () => {
      const a: Hlc = { timestamp: 100, counter: 0, nodeId: 'A' };
      const b: Hlc = { timestamp: 100, counter: 0, nodeId: 'A' };

      expect(compareHlc(a, b)).toBe(0);
    });

    it('should produce a consistent sort order for multiple HLCs', () => {
      const hlcs: Hlc[] = [
        { timestamp: 300, counter: 0, nodeId: 'B' },
        { timestamp: 100, counter: 0, nodeId: 'A' },
        { timestamp: 200, counter: 0, nodeId: 'A' },
        { timestamp: 200, counter: 1, nodeId: 'A' },
        { timestamp: 200, counter: 1, nodeId: 'B' },
      ];

      const sorted = [...hlcs].sort(compareHlc);
      expect(sorted[0]).toEqual({ timestamp: 100, counter: 0, nodeId: 'A' });
      expect(sorted[1]).toEqual({ timestamp: 200, counter: 0, nodeId: 'A' });
      expect(sorted[2]).toEqual({ timestamp: 200, counter: 1, nodeId: 'A' });
      expect(sorted[3]).toEqual({ timestamp: 200, counter: 1, nodeId: 'B' });
      expect(sorted[4]).toEqual({ timestamp: 300, counter: 0, nodeId: 'B' });
    });
  });
});
