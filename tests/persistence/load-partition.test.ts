import { describe, it, expect } from 'vitest';
import { loadPartition } from '@strata/persistence/load-partition';
import { createMemoryBlobAdapter } from '@strata/persistence/memory-blob-adapter';
import { defineEntity } from '@strata/schema';
import { serialize } from '@strata/persistence/serialize';

const TestEntity = defineEntity<{ name: string }>('TestEntity');

describe('loadPartition', () => {
  it('returns empty array when blob does not exist', async () => {
    const adapter = createMemoryBlobAdapter();
    const result = await loadPartition(adapter, TestEntity, '2025');
    expect(result).toEqual([]);
  });

  it('loads entities from stored blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const blob = {
      TestEntity: {
        'TestEntity.2025.abc': { id: 'TestEntity.2025.abc', name: 'Alice' },
        'TestEntity.2025.def': { id: 'TestEntity.2025.def', name: 'Bob' },
      },
    };
    const json = serialize(blob);
    await adapter.write('TestEntity.2025', new TextEncoder().encode(json));

    const result = await loadPartition(adapter, TestEntity, '2025');
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ id: 'TestEntity.2025.abc', name: 'Alice' });
    expect(result).toContainEqual({ id: 'TestEntity.2025.def', name: 'Bob' });
  });

  it('returns empty array when entity name not in blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const blob = {
      OtherEntity: {
        'OtherEntity.2025.abc': { id: 'OtherEntity.2025.abc' },
      },
    };
    const json = serialize(blob);
    await adapter.write('TestEntity.2025', new TextEncoder().encode(json));

    const result = await loadPartition(adapter, TestEntity, '2025');
    expect(result).toEqual([]);
  });
});
