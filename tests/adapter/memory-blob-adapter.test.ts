import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';

describe('MemoryBlobAdapter', () => {
  it('read/write round-trip', async () => {
    const adapter = new MemoryBlobAdapter();
    const data = { hello: { world: {} }, deleted: {} };
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
    const data = { a: { v1: {} }, deleted: {} };
    await adapter.write(undefined, 'key', data);
    (data as Record<string, unknown>)['extra'] = 'mutated';
    const result = await adapter.read(undefined, 'key');
    expect((result as Record<string, unknown>)['extra']).toBeUndefined();
  });

  it('read returns defensive copy', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'key', { a: { v1: {} }, deleted: {} });
    const result1 = await adapter.read(undefined, 'key') as Record<string, unknown>;
    result1['extra'] = 'mutated';
    const result2 = await adapter.read(undefined, 'key') as Record<string, unknown>;
    expect(result2['extra']).toBeUndefined();
  });

  it('delete returns true when key exists', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'key', { v: { x: {} }, deleted: {} });
    expect(await adapter.delete(undefined, 'key')).toBe(true);
  });

  it('delete returns false when key missing', async () => {
    const adapter = new MemoryBlobAdapter();
    expect(await adapter.delete(undefined, 'missing')).toBe(false);
  });

  it('list filters by prefix', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'foo.a', { v: { x: {} }, deleted: {} });
    await adapter.write(undefined, 'foo.b', { v: { x: {} }, deleted: {} });
    await adapter.write(undefined, 'bar.c', { v: { x: {} }, deleted: {} });
    const result = await adapter.list(undefined, 'foo');
    expect(result.sort()).toEqual(['foo.a', 'foo.b']);
  });

  it('list returns empty for no matches', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, 'foo', { v: { x: {} }, deleted: {} });
    expect(await adapter.list(undefined, 'bar')).toEqual([]);
  });
});
