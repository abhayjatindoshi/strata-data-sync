import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '../../../src/persistence/index.js';

describe('Integration: MemoryBlobAdapter', () => {
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
