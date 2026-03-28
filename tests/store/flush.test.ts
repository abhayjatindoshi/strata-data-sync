import { describe, it, expect } from 'vitest';
import { Store } from '@strata/store';
import { MemoryBlobAdapter } from '@strata/adapter';
import { loadPartitionFromAdapter } from '@strata/store/flush';

describe('loadPartitionFromAdapter', () => {
  it('loads entities from blob without deleted section', async () => {
    const adapter = new MemoryBlobAdapter();
    const store = new Store();

    const blob = { task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } }, deleted: {} };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(result.get('task._.a1')).toEqual({ id: 'task._.a1', name: 'Test' });
    expect(store.getTombstones('task._').size).toBe(0);
  });

  it('returns empty map when blob does not exist', async () => {
    const adapter = new MemoryBlobAdapter();
    const store = new Store();

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });

  it('loads entities and tombstones from blob with deleted section', async () => {
    const adapter = new MemoryBlobAdapter();
    const store = new Store();

    const blob = {
      task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } },
      deleted: {
        task: { 'task._.d1': { timestamp: 999, counter: 0, nodeId: 'n1' } },
      },
    };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(store.getTombstones('task._').get('task._.d1')).toBeDefined();
  });
});
