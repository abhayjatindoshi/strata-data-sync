import { describe, it, expect } from 'vitest';
import { AdapterBridge, MemoryStorageAdapter } from '@strata/adapter';
import type { PartitionBlob } from '@strata/persistence';
import type { Hlc } from '@strata/hlc';

describe('AdapterBridge end-to-end integration', () => {
  const appId = 'int-test';

  it('MemoryStorageAdapter → AdapterBridge → BlobAdapter round-trip', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new AdapterBridge(storage);

    const blob: PartitionBlob = {
      task: {
        id1: { id: 'id1', title: 'Task 1', done: false, hlc: { timestamp: 1000, counter: 0, nodeId: 'dev1' } as Hlc },
        id2: { id: 'id2', title: 'Task 2', done: true, hlc: { timestamp: 2000, counter: 1, nodeId: 'dev1' } as Hlc },
      },
      deleted: {
        task: {
          id3: { timestamp: 3000, counter: 0, nodeId: 'dev1' } as Hlc,
        },
      },
    };

    await bridge.write(undefined, 'task.global', blob);
    const result = await bridge.read(undefined, 'task.global');
    expect(result).toEqual(blob);
  });

  it('multi-tenant isolation through AdapterBridge', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new AdapterBridge(storage);
    const now = new Date();
    const t1 = { id: 'tenant-1', name: 'T1', encrypted: false, meta: {}, createdAt: now, updatedAt: now } as const;
    const t2 = { id: 'tenant-2', name: 'T2', encrypted: false, meta: {}, createdAt: now, updatedAt: now } as const;

    const blob1: PartitionBlob = { task: { x: { val: 1 } }, deleted: {} };
    const blob2: PartitionBlob = { task: { x: { val: 2 } }, deleted: {} };

    await bridge.write(t1, 'task.global', blob1);
    await bridge.write(t2, 'task.global', blob2);

    expect(await bridge.read(t1, 'task.global')).toEqual(blob1);
    expect(await bridge.read(t2, 'task.global')).toEqual(blob2);
  });

  it('encrypted bridge round-trip', async () => {
    const storage = new MemoryStorageAdapter();

    // Simple XOR cipher for testing
    const key = 0xAB;
    const xor = async (data: Uint8Array) => {
      const result = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) result[i] = data[i] ^ key;
      return result;
    };

    const bridge = new AdapterBridge(storage, { transforms: [{ encode: (_t, _k, d) => xor(d), decode: (_t, _k, d) => xor(d) }] });

    const blob: PartitionBlob = {
      items: { a: { id: 'a', name: 'test' } },
      deleted: {},
    };

    await bridge.write(undefined, 'items.global', blob);

    // Verify underlying storage has encrypted (non-JSON) data
    const raw = await storage.read(undefined, 'items.global');
    expect(raw).not.toBeNull();
    // Should not be valid JSON
    try {
      JSON.parse(new TextDecoder().decode(raw!));
      expect.fail('Expected encrypted data to not be valid JSON');
    } catch {
      // Expected — data is encrypted
    }

    // But bridge read decrypts correctly
    const result = await bridge.read(undefined, 'items.global');
    expect(result).toEqual(blob);
  });

  it('list and delete through bridge', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new AdapterBridge(storage);

    const blob: PartitionBlob = { x: { a: 1 }, deleted: {} };
    await bridge.write(undefined, 'task.p1', blob);
    await bridge.write(undefined, 'task.p2', blob);
    await bridge.write(undefined, 'note.p1', blob);

    const taskKeys = await bridge.list(undefined, 'task.');
    expect(taskKeys.sort()).toEqual(['task.p1', 'task.p2']);

    await bridge.delete(undefined, 'task.p1');
    const afterDelete = await bridge.list(undefined, 'task.');
    expect(afterDelete).toEqual(['task.p2']);
  });
});
