import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter, storePartition, loadPartition } from '../../../src/persistence/index.js';
import { defineEntity } from '../../../src/schema/index.js';

describe('Integration: Persistence round-trip (store → load)', () => {
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
    const titles = loaded.map((e) => e['title']);
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
