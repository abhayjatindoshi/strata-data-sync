import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from './memory-blob-adapter.js';

describe('MemoryBlobAdapter', () => {
  it('returns null for missing keys', async () => {
    const adapter = new MemoryBlobAdapter();
    const result = await adapter.read(undefined, 'missing');
    expect(result).toBeNull();
  });

  it('writes and reads data', async () => {
    const adapter = new MemoryBlobAdapter();
    const data = new TextEncoder().encode('hello');

    await adapter.write(undefined, 'test/file.json', data);
    const result = await adapter.read(undefined, 'test/file.json');

    expect(result).toEqual(data);
  });

  it('deletes data', async () => {
    const adapter = new MemoryBlobAdapter();
    const data = new TextEncoder().encode('hello');

    await adapter.write(undefined, 'key', data);
    await adapter.delete(undefined, 'key');
    const result = await adapter.read(undefined, 'key');

    expect(result).toBeNull();
  });

  it('lists keys by prefix', async () => {
    const adapter = new MemoryBlobAdapter();
    const data = new TextEncoder().encode('x');

    await adapter.write(undefined, 'todo/a.json', data);
    await adapter.write(undefined, 'todo/b.json', data);
    await adapter.write(undefined, 'settings/c.json', data);

    const result = await adapter.list(undefined, 'todo/');
    expect(result).toEqual(['todo/a.json', 'todo/b.json']);
  });

  it('returns empty list when no keys match prefix', async () => {
    const adapter = new MemoryBlobAdapter();
    const result = await adapter.list(undefined, 'nonexistent/');
    expect(result).toEqual([]);
  });

  it('accepts cloudMeta parameter', async () => {
    const adapter = new MemoryBlobAdapter();
    const meta = { tenantId: 'abc' } as const;
    const data = new TextEncoder().encode('test');

    await adapter.write(meta, 'key', data);
    const result = await adapter.read(meta, 'key');
    expect(result).toEqual(data);

    const list = await adapter.list(meta, 'k');
    expect(list).toEqual(['key']);

    await adapter.delete(meta, 'key');
    const deleted = await adapter.read(meta, 'key');
    expect(deleted).toBeNull();
  });
});
