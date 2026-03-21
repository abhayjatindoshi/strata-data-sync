import { describe, it, expect } from 'vitest';
import { isStale } from './stale-check.js';

describe('isStale', () => {
  it('returns false when metadata is unchanged', () => {
    const meta = { 'Txn.2025': { hash: 100, updatedAt: 1000 } };
    expect(isStale(meta, meta, ['Txn.2025'])).toBe(false);
  });

  it('returns true when hash changed', () => {
    const before = { 'Txn.2025': { hash: 100, updatedAt: 1000 } };
    const after = { 'Txn.2025': { hash: 200, updatedAt: 1000 } };
    expect(isStale(before, after, ['Txn.2025'])).toBe(true);
  });

  it('returns true when updatedAt changed', () => {
    const before = { 'Txn.2025': { hash: 100, updatedAt: 1000 } };
    const after = { 'Txn.2025': { hash: 100, updatedAt: 2000 } };
    expect(isStale(before, after, ['Txn.2025'])).toBe(true);
  });

  it('returns true when a new partition appears', () => {
    expect(isStale({}, { 'Txn.2025': { hash: 100, updatedAt: 1000 } }, ['Txn.2025'])).toBe(true);
  });

  it('returns true when a partition disappears', () => {
    const before = { 'Txn.2025': { hash: 100, updatedAt: 1000 } };
    expect(isStale(before, {}, ['Txn.2025'])).toBe(true);
  });

  it('only checks specified entity keys', () => {
    const before = { 'Txn.2025': { hash: 100, updatedAt: 1000 } };
    const after = { 'Txn.2025': { hash: 200, updatedAt: 1000 } };
    expect(isStale(before, after, ['Other.2025'])).toBe(false);
  });

  it('returns false when both sides lack the checked key', () => {
    expect(isStale({}, {}, ['Txn.2025'])).toBe(false);
  });
});
