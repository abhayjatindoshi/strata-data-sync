import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/persistence/memory-blob-adapter';

describe('createMemoryBlobAdapter', () => {
  it('returns null for non-existent key', async () => {
    const adapter = createMemoryBlobAdapter();
    expect(await adapter.read('missing')).toBeNull();
  });

  it('writes and reads data', async () => {
    const adapter = createMemoryBlobAdapter();
    const data = new TextEncoder().encode('hello');
    await adapter.write('key1', data);
    const result = await adapter.read('key1');
    expect(result).toEqual(new Uint8Array(data));
  });

  it('does not share buffer references on write', async () => {
    const adapter = createMemoryBlobAdapter();
    const data = new TextEncoder().encode('hello');
    await adapter.write('key1', data);
    data[0] = 0;
    const result = await adapter.read('key1');
    expect(new TextDecoder().decode(result!)).toBe('hello');
  });

  it('deletes data', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write('key1', new TextEncoder().encode('hello'));
    await adapter.delete('key1');
    expect(await adapter.read('key1')).toBeNull();
  });

  it('lists keys by prefix', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write('Transaction.2025', new Uint8Array());
    await adapter.write('Transaction.2024', new Uint8Array());
    await adapter.write('Account.2025', new Uint8Array());

    const result = await adapter.list('Transaction');
    expect(result).toHaveLength(2);
    expect(result).toContain('Transaction.2025');
    expect(result).toContain('Transaction.2024');
  });

  it('returns empty array when no keys match prefix', async () => {
    const adapter = createMemoryBlobAdapter();
    await adapter.write('Account.2025', new Uint8Array());
    expect(await adapter.list('Transaction')).toEqual([]);
  });
});
