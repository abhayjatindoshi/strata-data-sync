import { describe, it, expect } from 'vitest';
import {
  createMemoryBlobAdapter,
  storePartition,
  loadPartition,
  fnv1a,
  computePartitionMetadata,
  serialize,
} from '@strata/persistence';
import { defineEntity } from '@strata/schema';
import { createHlc, tickLocal } from '@strata/hlc';

// ── MemoryBlobAdapter ───────────────────────────────────────────────
describe('MemoryBlobAdapter', () => {
  it('should write and read a blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const data = new TextEncoder().encode('hello world');
    await adapter.write('test/key1', data);

    const result = await adapter.read('test/key1');
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(result!)).toBe('hello world');
  });

  it('should return null for a missing key', async () => {
    const adapter = createMemoryBlobAdapter();
    const result = await adapter.read('nonexistent');
    expect(result).toBeNull();
  });

  it('should list blobs by prefix', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write('orders.2025-01', new Uint8Array([1]));
    await adapter.write('orders.2025-02', new Uint8Array([2]));
    await adapter.write('users.2025-01', new Uint8Array([3]));

    const orderKeys = await adapter.list('orders.');
    expect(orderKeys).toHaveLength(2);
    expect(orderKeys).toContain('orders.2025-01');
    expect(orderKeys).toContain('orders.2025-02');

    const userKeys = await adapter.list('users.');
    expect(userKeys).toHaveLength(1);
    expect(userKeys).toContain('users.2025-01');
  });

  it('should return empty array when no keys match prefix', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write('orders.2025-01', new Uint8Array([1]));

    const result = await adapter.list('products.');
    expect(result).toHaveLength(0);
  });

  it('should delete a blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const data = new TextEncoder().encode('to be deleted');
    await adapter.write('temp/key', data);

    const before = await adapter.read('temp/key');
    expect(before).not.toBeNull();

    await adapter.delete('temp/key');

    const after = await adapter.read('temp/key');
    expect(after).toBeNull();
  });

  it('should not throw when deleting a nonexistent key', async () => {
    const adapter = createMemoryBlobAdapter();
    await expect(adapter.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('should overwrite an existing blob', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write('key', new TextEncoder().encode('v1'));
    await adapter.write('key', new TextEncoder().encode('v2'));

    const result = await adapter.read('key');
    expect(new TextDecoder().decode(result!)).toBe('v2');
  });

  it('should store a copy of data (not a reference)', async () => {
    const adapter = createMemoryBlobAdapter();
    const original = new Uint8Array([10, 20, 30]);
    await adapter.write('copy-test', original);

    original[0] = 99;
    const stored = await adapter.read('copy-test');
    expect(stored![0]).toBe(10);
  });
});

// ── Persistence round-trip (store → load) ───────────────────────────
describe('Persistence round-trip (store → load)', () => {
  const taskDef = defineEntity('task');

  it('should store and load entities through the adapter', async () => {
    const adapter = createMemoryBlobAdapter();
    const entities = [
      { id: 'task.2025-03.abc', title: 'Write tests', done: false },
      { id: 'task.2025-03.def', title: 'Review PR', done: true },
    ];

    await storePartition(adapter, taskDef, '2025-03', entities);
    const loaded = await loadPartition(adapter, taskDef, '2025-03');

    expect(loaded).toHaveLength(2);
    const titles = loaded.map((e: Record<string, unknown>) => e['title']);
    expect(titles).toContain('Write tests');
    expect(titles).toContain('Review PR');
  });

  it('should preserve all entity fields through round-trip', async () => {
    const adapter = createMemoryBlobAdapter();
    const entity = {
      id: 'task.2025-01.x1',
      title: 'Deploy',
      priority: 5,
      tags: ['urgent', 'ops'],
      nested: { key: 'value' },
    };

    await storePartition(adapter, taskDef, '2025-01', [entity]);
    const loaded = await loadPartition(adapter, taskDef, '2025-01');

    expect(loaded).toHaveLength(1);
    const result = loaded[0]!;
    expect(result['id']).toBe('task.2025-01.x1');
    expect(result['title']).toBe('Deploy');
    expect(result['priority']).toBe(5);
    expect(result['tags']).toEqual(['urgent', 'ops']);
    expect(result['nested']).toEqual({ key: 'value' });
  });

  it('should return empty array when loading a nonexistent partition', async () => {
    const adapter = createMemoryBlobAdapter();
    const loaded = await loadPartition(adapter, taskDef, 'missing');
    expect(loaded).toEqual([]);
  });

  it('should overwrite partition data on store', async () => {
    const adapter = createMemoryBlobAdapter();
    const v1 = [{ id: 'task.2025-06.a', title: 'Original' }];
    const v2 = [{ id: 'task.2025-06.b', title: 'Replacement' }];

    await storePartition(adapter, taskDef, '2025-06', v1);
    await storePartition(adapter, taskDef, '2025-06', v2);

    const loaded = await loadPartition(adapter, taskDef, '2025-06');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!['title']).toBe('Replacement');
  });

  it('should work with multiple entity types and partitions', async () => {
    const adapter = createMemoryBlobAdapter();
    const userDef = defineEntity('user');

    await storePartition(adapter, taskDef, '2025-01', [
      { id: 'task.2025-01.t1', title: 'Task A' },
    ]);
    await storePartition(adapter, userDef, '2025-01', [
      { id: 'user.2025-01.u1', name: 'Alice' },
    ]);

    const tasks = await loadPartition(adapter, taskDef, '2025-01');
    const users = await loadPartition(adapter, userDef, '2025-01');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]!['title']).toBe('Task A');
    expect(users).toHaveLength(1);
    expect(users[0]!['name']).toBe('Alice');
  });

  it('should reject entities without a string id', async () => {
    const adapter = createMemoryBlobAdapter();
    const badEntities = [{ notId: 'missing' }] as unknown as readonly Record<string, unknown>[];

    await expect(
      storePartition(adapter, taskDef, '2025-01', badEntities),
    ).rejects.toThrow('Entity must have a string "id" field');
  });
});

// ── Partition metadata ──────────────────────────────────────────────
describe('Partition metadata', () => {
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
