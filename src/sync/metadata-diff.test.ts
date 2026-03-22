import { describe, it, expect } from 'vitest';
import { metadataDiff } from './metadata-diff';

describe('metadataDiff', () => {
  it('returns empty buckets for empty maps', () => {
    const result = metadataDiff({}, {});
    expect(result).toEqual({ aOnly: [], bOnly: [], mismatched: [] });
  });

  it('identifies a-only partitions', () => {
    const a = { 'Txn.2025': { hash: 123, updatedAt: 1000 } };
    const result = metadataDiff(a, {});
    expect(result.aOnly).toEqual(['Txn.2025']);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });

  it('identifies b-only partitions', () => {
    const b = { 'Txn.2025': { hash: 123, updatedAt: 1000 } };
    const result = metadataDiff({}, b);
    expect(result.bOnly).toEqual(['Txn.2025']);
    expect(result.aOnly).toEqual([]);
  });

  it('skips matching partitions', () => {
    const meta = { 'Txn.2025': { hash: 123, updatedAt: 1000 } };
    const result = metadataDiff(meta, meta);
    expect(result.aOnly).toEqual([]);
    expect(result.bOnly).toEqual([]);
    expect(result.mismatched).toEqual([]);
  });

  it('identifies mismatched partitions by hash', () => {
    const a = { 'Txn.2025': { hash: 100, updatedAt: 1000 } };
    const b = { 'Txn.2025': { hash: 200, updatedAt: 1000 } };
    const result = metadataDiff(a, b);
    expect(result.mismatched).toEqual(['Txn.2025']);
  });

  it('categorizes mixed partitions correctly', () => {
    const a = {
      'Txn.2024': { hash: 10, updatedAt: 900 },
      'Txn.2025': { hash: 100, updatedAt: 1000 },
      'Acc.main': { hash: 50, updatedAt: 500 },
    };
    const b = {
      'Txn.2025': { hash: 200, updatedAt: 1000 },
      'Acc.main': { hash: 50, updatedAt: 500 },
      'Cat.all': { hash: 30, updatedAt: 300 },
    };
    const result = metadataDiff(a, b);
    expect(result.aOnly).toEqual(['Txn.2024']);
    expect(result.bOnly).toEqual(['Cat.all']);
    expect(result.mismatched).toEqual(['Txn.2025']);
  });
});
