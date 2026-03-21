import { describe, it, expect } from 'vitest';
import { storePartition } from './store-partition.js';
import { loadPartition } from './load-partition.js';
import { createMemoryBlobAdapter } from './memory-blob-adapter.js';
import { defineEntity } from '../schema/index.js';

const TestEntity = defineEntity<{ name: string }>('TestEntity');

describe('storePartition', () => {
  it('stores entities as a blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const entities = [
      { id: 'TestEntity.2025.abc', name: 'Alice' },
      { id: 'TestEntity.2025.def', name: 'Bob' },
    ];
    await storePartition(adapter, TestEntity, '2025', entities);

    const data = await adapter.read('TestEntity.2025');
    expect(data).not.toBeNull();
  });

  it('round-trips with loadPartition', async () => {
    const adapter = createMemoryBlobAdapter();
    const entities = [
      { id: 'TestEntity.2025.abc', name: 'Alice' },
      { id: 'TestEntity.2025.def', name: 'Bob' },
    ];
    await storePartition(adapter, TestEntity, '2025', entities);
    const loaded = await loadPartition(adapter, TestEntity, '2025');

    expect(loaded).toHaveLength(2);
    expect(loaded).toContainEqual({ id: 'TestEntity.2025.abc', name: 'Alice' });
    expect(loaded).toContainEqual({ id: 'TestEntity.2025.def', name: 'Bob' });
  });

  it('throws when entity lacks id field', async () => {
    const adapter = createMemoryBlobAdapter();
    const entities = [{ name: 'Alice' }];
    await expect(
      storePartition(adapter, TestEntity, '2025', entities),
    ).rejects.toThrow('Entity must have a string "id" field');
  });
});
