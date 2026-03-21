import { describe, it, expect } from 'vitest';
import { compareEntityHlc, resolveConflict } from '../../../src/sync/index.js';
import type { EntityHlc } from '../../../src/sync/index.js';

describe('Integration: conflict-resolution', () => {
  describe('LWW via HLC', () => {
    it('picks higher updatedAt as winner', () => {
      const a: EntityHlc = { updatedAt: 200, version: 1, device: 'A' };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      expect(resolveConflict(a, b).winner).toBe('a');
      expect(resolveConflict(b, a).winner).toBe('b');
    });

    it('falls back to version when updatedAt is equal', () => {
      const a: EntityHlc = { updatedAt: 100, version: 5, device: 'A' };
      const b: EntityHlc = { updatedAt: 100, version: 3, device: 'A' };
      expect(resolveConflict(a, b).winner).toBe('a');
    });

    it('falls back to device tiebreaker when all else is equal', () => {
      const a: EntityHlc = { updatedAt: 100, version: 1, device: 'B' };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      expect(resolveConflict(a, b).winner).toBe('a');
    });

    it('returns equal when HLCs are identical and both alive', () => {
      const hlc: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      const result = resolveConflict(hlc, { ...hlc });
      expect(result.winner).toBe('equal');
      expect(result.deleted).toBe(false);
    });
  });

  describe('delete-wins-on-equal', () => {
    it('deleted side wins when HLCs are otherwise equal', () => {
      const alive: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      const dead: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const result = resolveConflict(alive, dead);
      expect(result.winner).toBe('b');
      expect(result.deleted).toBe(true);
    });

    it('both deleted + equal HLC returns equal with deleted true', () => {
      const a: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const result = resolveConflict(a, b);
      expect(result.winner).toBe('equal');
      expect(result.deleted).toBe(true);
    });

    it('higher HLC still wins even if the other is deleted', () => {
      const a: EntityHlc = { updatedAt: 200, version: 1, device: 'A' };
      const b: EntityHlc = { updatedAt: 100, version: 1, device: 'A', deleted: true };
      const result = resolveConflict(a, b);
      expect(result.winner).toBe('a');
      expect(result.deleted).toBe(false);
    });
  });

  describe('compareEntityHlc ordering', () => {
    it('returns -1, 0, 1 correctly', () => {
      const low: EntityHlc = { updatedAt: 100, version: 1, device: 'A' };
      const high: EntityHlc = { updatedAt: 200, version: 1, device: 'A' };
      expect(compareEntityHlc(low, high)).toBe(-1);
      expect(compareEntityHlc(high, low)).toBe(1);
      expect(compareEntityHlc(low, { ...low })).toBe(0);
    });
  });
});
