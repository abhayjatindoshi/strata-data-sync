import { describe, it, expect } from 'vitest';
import {
  fnv1a,
  computePartitionMetadata,
  serialize,
  createMemoryBlobAdapter,
  storePartition,
} from '../../../src/persistence/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import { createHlc, tickLocal } from '../../../src/hlc/index.js';

describe('Integration: Partition metadata', () => {
  describe('fnv1a hash', () => {
    it('should produce a consistent hash for the same input', () => {
      const hash1 = fnv1a('hello world');
      const hash2 = fnv1a('hello world');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = fnv1a('hello');
      const hash2 = fnv1a('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a non-negative 32-bit integer', () => {
      const hash = fnv1a('test string');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
    });
  });

  describe('computePartitionMetadata', () => {
    it('should compute metadata with hash and HLC timestamp', () => {
      const content = serialize({ task: { t1: { id: 't1', title: 'Test' } } });
      const hlcTimestamp = 1700000000000;

      const metadata = computePartitionMetadata(content, hlcTimestamp);

      expect(metadata.hash).toBe(fnv1a(content));
      expect(metadata.hlcTimestamp).toBe(hlcTimestamp);
    });

    it('should detect content changes via different hashes', () => {
      const content1 = serialize({ task: { t1: { id: 't1', title: 'v1' } } });
      const content2 = serialize({ task: { t1: { id: 't1', title: 'v2' } } });

      const meta1 = computePartitionMetadata(content1, 1000);
      const meta2 = computePartitionMetadata(content2, 1000);

      expect(meta1.hash).not.toBe(meta2.hash);
    });

    it('should track HLC timestamp progression', () => {
      const content = serialize({ task: {} });
      const hlc1 = createHlc('node-A');
      const hlc2 = tickLocal(hlc1);

      const meta1 = computePartitionMetadata(content, hlc1.timestamp);
      const meta2 = computePartitionMetadata(content, hlc2.timestamp);

      expect(meta2.hlcTimestamp).toBeGreaterThanOrEqual(meta1.hlcTimestamp);
    });
  });

  describe('end-to-end: store + hash consistency', () => {
    it('should produce consistent metadata for the same stored content', async () => {
      const adapter = createMemoryBlobAdapter();
      const taskDef = defineEntity('task');
      const entities = [
        { id: 'task.2025-01.a', title: 'Alpha' },
        { id: 'task.2025-01.b', title: 'Beta' },
      ];

      await storePartition(adapter, taskDef, '2025-01', entities);

      const blob = await adapter.read('task.2025-01');
      const json = new TextDecoder().decode(blob!);

      const meta = computePartitionMetadata(json, Date.now());
      expect(meta.hash).toBe(fnv1a(json));
    });

    it('should produce different metadata when partition content changes', async () => {
      const adapter = createMemoryBlobAdapter();
      const taskDef = defineEntity('task');

      await storePartition(adapter, taskDef, '2025-02', [
        { id: 'task.2025-02.a', title: 'First' },
      ]);
      const blob1 = await adapter.read('task.2025-02');
      const hash1 = fnv1a(new TextDecoder().decode(blob1!));

      await storePartition(adapter, taskDef, '2025-02', [
        { id: 'task.2025-02.a', title: 'Updated' },
      ]);
      const blob2 = await adapter.read('task.2025-02');
      const hash2 = fnv1a(new TextDecoder().decode(blob2!));

      expect(hash1).not.toBe(hash2);
    });
  });
});
