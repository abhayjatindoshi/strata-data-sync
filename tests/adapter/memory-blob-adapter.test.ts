import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';

describe('MemoryBlobAdapter', () => {
  it('read/write round-trip', async () => {
    const adapter = createMemoryBlobAdapter();
    const data = new TextEncoder().encode('hello');
    await adapter.write(undefined, 'test-key', data);
    const result = await adapter.read(undefined, 'test-key');
    expect(result).toEqual(data);
  });

  it('read returns null for missing key', async () => {
    const adapter = createMemoryBlobAdapter();
    const result = await adapter.read(undefined, 'missing');
    expect(result).toBeNull();
  });

  it('write stores defensive copy (mutation isolation)', async () => {
    const adapter = createMemoryBlobAdapter();
    const data = new Uint8Array([1, 2, 3]);
    await adapter.write(undefined, 'key', data);
    data[0] = 99;
    const result = await adapter.read(undefined, 'key');
    expect(result![0]).toBe(1);
  });

  it('read returns defensive copy', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write(undefined, 'key', new Uint8Array([1, 2, 3]));
    const result1 = await adapter.read(undefined, 'key');
    result1![0] = 99;
    const result2 = await adapter.read(undefined, 'key');
    expect(result2![0]).toBe(1);
  });

  it('delete returns true when key exists', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write(undefined, 'key', new Uint8Array([1]));
    expect(await adapter.delete(undefined, 'key')).toBe(true);
  });

  it('delete returns false when key missing', async () => {
    const adapter = createMemoryBlobAdapter();
    expect(await adapter.delete(undefined, 'missing')).toBe(false);
  });

  it('list filters by prefix', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write(undefined, 'foo.a', new Uint8Array([1]));
    await adapter.write(undefined, 'foo.b', new Uint8Array([2]));
    await adapter.write(undefined, 'bar.c', new Uint8Array([3]));
    const result = await adapter.list(undefined, 'foo');
    expect(result.sort()).toEqual(['foo.a', 'foo.b']);
  });

  it('list returns empty for no matches', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write(undefined, 'foo', new Uint8Array([1]));
    expect(await adapter.list(undefined, 'bar')).toEqual([]);
  });
});
