import { describe, it, expect } from 'vitest';
import { AdapterBridge, MemoryStorageAdapter } from '@strata/adapter';
import type { BlobTransform } from '@strata/adapter';
import type { PartitionBlob } from '@strata/persistence';
import type { Hlc } from '@strata/hlc';

describe('AdapterBridge', () => {
  const appId = 'test-app';

  function createBridge(options?: {
    transforms?: ReadonlyArray<BlobTransform>;
  }) {
    const storage = new MemoryStorageAdapter();
    const bridge = new AdapterBridge(storage, appId, options);
    return { storage, bridge };
  }

  const sampleBlob: PartitionBlob = {
    task: {
      id1: { id: 'id1', title: 'Hello', hlc: { timestamp: 1000, counter: 0, nodeId: 'a' } as Hlc },
    },
    deleted: {
      task: {},
    },
  };

  it('serialize/deserialize round-trip without encryption', async () => {
    const { bridge } = createBridge();
    await bridge.write(undefined, 'task.global', sampleBlob);
    const result = await bridge.read(undefined, 'task.global');
    expect(result).toEqual(sampleBlob);
  });

  it('read returns null for missing key', async () => {
    const { bridge } = createBridge();
    const result = await bridge.read(undefined, 'missing');
    expect(result).toBeNull();
  });

  it('namespaces keys with appId', async () => {
    const { storage, bridge } = createBridge();
    await bridge.write(undefined, 'task.global', sampleBlob);
    // Key in underlying storage should be namespaced
    const raw = await storage.read(undefined, `${appId}/task.global`);
    expect(raw).not.toBeNull();
    // Non-namespaced key should return null
    const direct = await storage.read(undefined, 'task.global');
    expect(direct).toBeNull();
  });

  it('list strips appId prefix from keys', async () => {
    const { bridge } = createBridge();
    await bridge.write(undefined, 'task.a', sampleBlob);
    await bridge.write(undefined, 'task.b', sampleBlob);
    await bridge.write(undefined, 'note.c', sampleBlob);
    const result = await bridge.list(undefined, 'task.');
    expect(result.sort()).toEqual(['task.a', 'task.b']);
  });

  it('delete removes namespaced key', async () => {
    const { bridge } = createBridge();
    await bridge.write(undefined, 'task.global', sampleBlob);
    const deleted = await bridge.delete(undefined, 'task.global');
    expect(deleted).toBe(true);
    const result = await bridge.read(undefined, 'task.global');
    expect(result).toBeNull();
  });

  it('applies encrypt/decrypt hooks', async () => {
    // XOR cipher for testing
    const xorKey = 0x42;
    const xorTransform = (data: Uint8Array) => {
      const result = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) result[i] = data[i] ^ xorKey;
      return Promise.resolve(result);
    };

    const { storage, bridge } = createBridge({
      transforms: [{ encode: xorTransform, decode: xorTransform }],
    });

    await bridge.write(undefined, 'task.global', sampleBlob);

    // Raw storage should contain XOR'd bytes, not plain JSON
    const raw = await storage.read(undefined, `${appId}/task.global`);
    expect(raw).not.toBeNull();
    const plainJson = new TextEncoder().encode(JSON.stringify(sampleBlob));
    // XOR'd data should differ from plain JSON
    expect(raw).not.toEqual(plainJson);

    // But reading through bridge should decrypt correctly
    const result = await bridge.read(undefined, 'task.global');
    expect(result).toEqual(sampleBlob);
  });

  it('works without encrypt/decrypt hooks', async () => {
    const { bridge } = createBridge();
    await bridge.write(undefined, 'some-key', sampleBlob);
    const result = await bridge.read(undefined, 'some-key');
    expect(result).toEqual(sampleBlob);
  });

  it('handles tenant-scoped reads and writes', async () => {
    const { bridge } = createBridge();
    const now = new Date();
    const tenant = { id: 'tenant-1', name: 'Tenant 1', meta: {}, createdAt: now, updatedAt: now } as const;
    await bridge.write(tenant, 'task.global', sampleBlob);
    const result = await bridge.read(tenant, 'task.global');
    expect(result).toEqual(sampleBlob);

    // Different tenant should not find the key
    const otherTenant = { id: 'tenant-2', name: 'Tenant 2', meta: {}, createdAt: now, updatedAt: now } as const;
    const missing = await bridge.read(otherTenant, 'task.global');
    expect(missing).toBeNull();
  });
});
