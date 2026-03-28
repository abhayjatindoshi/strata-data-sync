import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';

describe('MemoryBlobAdapter', () => {
  it('read/write round-trip', async () => {
    const adapter = new MemoryBlobAdapter();
    const data = { hello: 'world' };
    await adapter.write(undefined, 'test-key', data);
    const result = await adapter.read(undefined, 'test-key');
    expect(result).toEqual(data);
  });

  it('read returns null for missing key', async () => {
    const adapter = new MemoryBlobAdapter();
    const result = await adapter.read(undefined, 'missing');
    expect(result).toBeNull();
  });

  it('write stores defensive copy (mutation isolation)', async () => {
    const adapter = new MemoryBlobAdapter();
    const data = { a: 1, b: 2, c: 3 };
    await adapter.write(undefined, 'key', data);
    data.a = 99;
    const result = await adapter.read(undefined, 'key') as { a: number };
    expect(result.a).toBe(1);
  });

  it('read returns defensive copy', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'key', { a: 1, b: 2, c: 3 });
    const result1 = await adapter.read(undefined, 'key') as { a: number };
    result1.a = 99;
    const result2 = await adapter.read(undefined, 'key') as { a: number };
    expect(result2.a).toBe(1);
  });

  it('delete returns true when key exists', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'key', { v: 1 });
    expect(await adapter.delete(undefined, 'key')).toBe(true);
  });

  it('delete returns false when key missing', async () => {
    const adapter = new MemoryBlobAdapter();
    expect(await adapter.delete(undefined, 'missing')).toBe(false);
  });

  it('list filters by prefix', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'foo.a', { v: 1 });
    await adapter.write(undefined, 'foo.b', { v: 2 });
    await adapter.write(undefined, 'bar.c', { v: 3 });
    const result = await adapter.list(undefined, 'foo');
    expect(result.sort()).toEqual(['foo.a', 'foo.b']);
  });

  it('list returns empty for no matches', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'foo', { v: 1 });
    expect(await adapter.list(undefined, 'bar')).toEqual([]);
  });
});
