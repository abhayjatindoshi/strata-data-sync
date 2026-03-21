import { describe, it, expect } from 'vitest';
import { compareEntityHlc, resolveConflict } from './conflict-resolution.js';
import type { EntityHlc } from './sync-types.js';

describe('compareEntityHlc', () => {
  it('returns 0 for equal HLCs', () => {
    const hlc: EntityHlc = { updatedAt: 1000, version: 1, device: 'a' };
    expect(compareEntityHlc(hlc, hlc)).toBe(0);
  });

  it('compares by updatedAt first', () => {
    const a: EntityHlc = { updatedAt: 2000, version: 0, device: 'a' };
    const b: EntityHlc = { updatedAt: 1000, version: 5, device: 'z' };
    expect(compareEntityHlc(a, b)).toBe(1);
    expect(compareEntityHlc(b, a)).toBe(-1);
  });

  it('compares by version when updatedAt is equal', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 2, device: 'a' };
    const b: EntityHlc = { updatedAt: 1000, version: 1, device: 'z' };
    expect(compareEntityHlc(a, b)).toBe(1);
    expect(compareEntityHlc(b, a)).toBe(-1);
  });

  it('compares by device when updatedAt and version are equal', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 1, device: 'phone' };
    const b: EntityHlc = { updatedAt: 1000, version: 1, device: 'laptop' };
    expect(compareEntityHlc(a, b)).toBe(1);
    expect(compareEntityHlc(b, a)).toBe(-1);
  });
});

describe('resolveConflict', () => {
  it('A wins when A has higher HLC', () => {
    const a: EntityHlc = { updatedAt: 2000, version: 0, device: 'a' };
    const b: EntityHlc = { updatedAt: 1000, version: 0, device: 'a' };
    expect(resolveConflict(a, b)).toEqual({ winner: 'a', deleted: false });
  });

  it('B wins when B has higher HLC', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 0, device: 'a' };
    const b: EntityHlc = { updatedAt: 2000, version: 0, device: 'a' };
    expect(resolveConflict(a, b)).toEqual({ winner: 'b', deleted: false });
  });

  it('returns equal when HLCs match and neither is deleted', () => {
    const hlc: EntityHlc = { updatedAt: 1000, version: 0, device: 'a' };
    expect(resolveConflict(hlc, hlc)).toEqual({ winner: 'equal', deleted: false });
  });

  it('delete wins on equal HLC — A deleted', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: true };
    const b: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: false };
    expect(resolveConflict(a, b)).toEqual({ winner: 'a', deleted: true });
  });

  it('delete wins on equal HLC — B deleted', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: false };
    const b: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: true };
    expect(resolveConflict(a, b)).toEqual({ winner: 'b', deleted: true });
  });

  it('active wins when it has higher HLC even if other is deleted', () => {
    const a: EntityHlc = { updatedAt: 2000, version: 0, device: 'a' };
    const b: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: true };
    expect(resolveConflict(a, b)).toEqual({ winner: 'a', deleted: false });
  });

  it('delete wins when it has higher HLC', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 0, device: 'a' };
    const b: EntityHlc = { updatedAt: 2000, version: 0, device: 'a', deleted: true };
    expect(resolveConflict(a, b)).toEqual({ winner: 'b', deleted: true });
  });

  it('equal HLC with both deleted returns equal', () => {
    const a: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: true };
    const b: EntityHlc = { updatedAt: 1000, version: 0, device: 'a', deleted: true };
    expect(resolveConflict(a, b)).toEqual({ winner: 'equal', deleted: true });
  });
});
