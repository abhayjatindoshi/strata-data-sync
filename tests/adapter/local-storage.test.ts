import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Tenant } from '@strata/adapter';
import { LocalStorageAdapter } from '@strata/adapter/local-storage';

// Minimal localStorage polyfill for Node
function createLocalStoragePolyfill(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) { return store.get(key) ?? null; },
    setItem(key: string, value: string) { store.set(key, value); },
    removeItem(key: string) { store.delete(key); },
    key(index: number) { return [...store.keys()][index] ?? null; },
    get length() { return store.size; },
    clear() { store.clear(); },
  } as Storage;
}

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  let originalLS: Storage;

  const tenant: Tenant = {
    id: 'tenant-1',
    name: 'Test Tenant',
    encrypted: false,
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    originalLS = globalThis.localStorage;
    (globalThis as Record<string, unknown>).localStorage = createLocalStoragePolyfill();
    adapter = new LocalStorageAdapter('test');
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).localStorage = originalLS;
  });

  it('creates with default prefix', () => {
    const defaultAdapter = new LocalStorageAdapter();
    expect(defaultAdapter).toBeDefined();
  });

  describe('read', () => {
    it('returns null for missing key', async () => {
      const result = await adapter.read(tenant, 'missing');
      expect(result).toBeNull();
    });

    it('returns data for existing key', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await adapter.write(tenant, 'myKey', data);
      const result = await adapter.read(tenant, 'myKey');
      expect(result).toEqual(data);
    });

    it('reads without tenant', async () => {
      const data = new Uint8Array([10, 20]);
      await adapter.write(undefined, 'global', data);
      const result = await adapter.read(undefined, 'global');
      expect(result).toEqual(data);
    });
  });

  describe('write', () => {
    it('stores data with tenant-scoped key', async () => {
      const data = new Uint8Array([65, 66, 67]);
      await adapter.write(tenant, 'file.json', data);
      const result = await adapter.read(tenant, 'file.json');
      expect(result).toEqual(data);
    });

    it('overwrites existing data', async () => {
      await adapter.write(tenant, 'k', new Uint8Array([1]));
      await adapter.write(tenant, 'k', new Uint8Array([2]));
      const result = await adapter.read(tenant, 'k');
      expect(result).toEqual(new Uint8Array([2]));
    });
  });

  describe('delete', () => {
    it('returns true when key existed', async () => {
      await adapter.write(tenant, 'k', new Uint8Array([1]));
      const result = await adapter.delete(tenant, 'k');
      expect(result).toBe(true);
    });

    it('returns false when key did not exist', async () => {
      const result = await adapter.delete(tenant, 'nope');
      expect(result).toBe(false);
    });

    it('removes data so read returns null', async () => {
      await adapter.write(tenant, 'k', new Uint8Array([1]));
      await adapter.delete(tenant, 'k');
      const result = await adapter.read(tenant, 'k');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns empty array when no keys match', async () => {
      const result = await adapter.list(tenant, 'nope');
      expect(result).toEqual([]);
    });

    it('lists keys matching prefix with tenant', async () => {
      await adapter.write(tenant, 'task._', new Uint8Array([1]));
      await adapter.write(tenant, 'task.2026-01', new Uint8Array([2]));
      await adapter.write(tenant, 'note._', new Uint8Array([3]));

      const result = await adapter.list(tenant, 'task');
      expect(result).toHaveLength(2);
      expect(result).toContain('task._');
      expect(result).toContain('task.2026-01');
    });

    it('lists keys without tenant', async () => {
      await adapter.write(undefined, 'task._', new Uint8Array([1]));
      await adapter.write(undefined, 'note._', new Uint8Array([2]));

      const result = await adapter.list(undefined, 'task');
      expect(result).toHaveLength(1);
      expect(result).toContain('task._');
    });
  });
});
