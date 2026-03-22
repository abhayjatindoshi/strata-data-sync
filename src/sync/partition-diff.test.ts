import { describe, it, expect } from 'vitest';
import type { PartitionIndex } from '../persistence/index.js';
import { comparePartitionIndexes } from './partition-diff.js';

function entry(hash: number): { hash: number; count: number; updatedAt: string } {
  return { hash, count: 1, updatedAt: '2024-01-01T00:00:00Z' };
}

describe('comparePartitionIndexes', () => {
  it('returns all unchanged for identical indexes', () => {
    const idx: PartitionIndex = { 'task._': entry(100) };
    const diff = comparePartitionIndexes(idx, idx);
    expect(diff.unchanged).toEqual(['task._']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('detects added (cloud-only) partitions', () => {
    const local: PartitionIndex = {};
    const cloud: PartitionIndex = { 'task._': entry(100) };
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.added).toEqual(['task._']);
  });

  it('detects removed (local-only) partitions', () => {
    const local: PartitionIndex = { 'task._': entry(100) };
    const cloud: PartitionIndex = {};
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.removed).toEqual(['task._']);
  });

  it('detects changed partitions by hash', () => {
    const local: PartitionIndex = { 'task._': entry(100) };
    const cloud: PartitionIndex = { 'task._': entry(200) };
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.changed).toEqual(['task._']);
  });

  it('handles empty indexes', () => {
    const diff = comparePartitionIndexes({}, {});
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it('handles mixed scenario', () => {
    const local: PartitionIndex = {
      'task._': entry(100),
      'note._': entry(200),
      'log._': entry(300),
    };
    const cloud: PartitionIndex = {
      'task._': entry(100),
      'note._': entry(999),
      'user._': entry(400),
    };
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.unchanged).toEqual(['task._']);
    expect(diff.changed).toEqual(['note._']);
    expect(diff.removed).toEqual(['log._']);
    expect(diff.added).toEqual(['user._']);
  });
});
