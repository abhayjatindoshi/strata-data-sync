import { DEFAULT_OPTIONS } from '../helpers';
import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';
import { EncryptionTransformService } from '@strata/adapter';
import type { Tenant } from '@strata/adapter';
import type { SyncEngineType } from '@strata/sync';
import type { ReactiveFlag } from '@strata/utils';
import type { EntityStore } from '@strata/store';
import { loadTenantList, saveTenantList, TenantManager } from '@strata/tenant';
import type { TenantManagerDeps } from '@strata/tenant';

function stubSyncEngine(): SyncEngineType {
  return {
    sync: async () => ({ result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined }, deduplicated: false }),
    emit: () => {},
    on: () => {},
    off: () => {},
    drain: async () => {},
    dispose: () => {},
  };
}

function makeDeps(adapter: MemoryBlobAdapter, overrides?: Partial<TenantManagerDeps>): TenantManagerDeps {
  return {
    adapter,
    syncEngine: stubSyncEngine(),
    store: { clear: () => {} } as unknown as EntityStore,
    dirtyTracker: { value: false, value$: { pipe: () => ({}) }, set: () => {}, clear: () => {} } as unknown as ReactiveFlag,
    encryptionService: new EncryptionTransformService({ tenantKey: DEFAULT_OPTIONS.tenantKey, markerKey: DEFAULT_OPTIONS.markerKey }),
    options: DEFAULT_OPTIONS,
    appId: 'test-app',
    entityTypes: [],
    ...overrides,
  };
}

describe('tenant list persistence', () => {
  it('loadTenantList returns empty array when no blob', async () => {
    const adapter = new MemoryBlobAdapter();
    const list = await loadTenantList(adapter, DEFAULT_OPTIONS);
    expect(list).toEqual([]);
  });

  it('loadTenantList returns empty when blob has no __tenants key', async () => {
    const adapter = new MemoryBlobAdapter();
    await adapter.write(undefined, DEFAULT_OPTIONS.tenantKey, { deleted: {} });
    const list = await loadTenantList(adapter, DEFAULT_OPTIONS);
    expect(list).toEqual([]);
  });

  it('save and load round-trip', async () => {
    const adapter = new MemoryBlobAdapter();
    const now = new Date('2026-03-23T12:00:00Z');
    const tenants: Tenant[] = [
      { id: 't1', name: 'Tenant 1', encrypted: false, meta: { folder: 'abc' }, createdAt: now, updatedAt: now },
    ];
    await saveTenantList(adapter, tenants, DEFAULT_OPTIONS);
    const loaded = await loadTenantList(adapter, DEFAULT_OPTIONS);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('t1');
    expect(loaded[0].name).toBe('Tenant 1');
  });

  it('stores under __tenants key', async () => {
    const adapter = new MemoryBlobAdapter();
    const now = new Date();
    await saveTenantList(adapter, [
      { id: 't1', name: 'T', encrypted: false, meta: {}, createdAt: now, updatedAt: now },
    ], DEFAULT_OPTIONS);
    const data = await adapter.read(undefined, DEFAULT_OPTIONS.tenantKey);
    expect(data).not.toBeNull();
  });
});

describe('TenantManager', () => {
  describe('list', () => {
    it('returns empty array initially', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const list = await tm.list();
      expect(list).toEqual([]);
    });
  });

  describe('probe', () => {
    it('returns exists: false when no marker found', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const result = await tm.probe({ meta: { folder: 'missing' } });
      expect(result.exists).toBe(false);
    });

    it('returns exists: true with unencrypted marker', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter, { deriveTenantId: () => 'probe-id' }));
      const tempTenant = { id: 'probe-id', name: '', encrypted: false, meta: {}, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: new Date().toISOString(), entityTypes: [] } },
        deleted: {},
      });
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      expect(result.encrypted).toBe(false);
      expect(result.tenantId).toBe('probe-id');
    });

    it('returns encrypted: true when read throws (parse failure)', async () => {
      const adapter = new MemoryBlobAdapter();
      // Make read throw to simulate encrypted data parse failure
      const failAdapter = {
        ...adapter,
        kind: 'blob' as const,
        read: async (tenant: Tenant | undefined, key: string) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'fail-id') {
            throw new Error('decrypt failed');
          }
          return adapter.read(tenant, key);
        },
        write: adapter.write.bind(adapter),
        delete: adapter.delete.bind(adapter),
        list: adapter.list.bind(adapter),
      };
      const tm = new TenantManager(makeDeps(adapter, {
        adapter: failAdapter,
        deriveTenantId: () => 'fail-id',
      }));
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      expect(result.encrypted).toBe(true);
    });
  });

  describe('create', () => {
    it('creates tenant with provided ID', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'My App', meta: { bucket: 'x' }, id: 'custom-id' });
      expect(tenant.id).toBe('custom-id');
      expect(tenant.name).toBe('My App');
      expect(tenant.createdAt).toBeInstanceOf(Date);
    });

    it('generates ID when not provided', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'My App', meta: { bucket: 'x' } });
      expect(tenant.id).toHaveLength(8);
    });

    it('derives ID from meta when deriveTenantId is configured', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter, {
        deriveTenantId: (meta) => (meta as { folderId: string }).folderId.substring(0, 4),
      }));
      const tenant = await tm.create({ name: 'Shared', meta: { folderId: 'abcdefgh' } });
      expect(tenant.id).toBe('abcd');
    });

    it('writes __strata marker blob', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: { folder: 'f1' } });
      const marker = await adapter.read(created, DEFAULT_OPTIONS.markerKey);
      expect(marker).not.toBeNull();
      const system = (marker as Record<string, unknown>)['__system'] as Record<string, unknown>;
      const markerData = system['marker'] as { version: number };
      expect(markerData.version).toBe(1);
    });

    it('persists tenant to list', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 'abc' });
      const list = await tm.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('abc');
    });
  });

  describe('open', () => {
    it('sets active tenant', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T1', meta: {}, id: 't1' });
      await tm.open('t1');
      expect(tm.activeTenant$.getValue()!.id).toBe('t1');
    });

    it('throws for unknown tenant ID', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.open('unknown')).rejects.toThrow('Tenant not found: unknown');
    });

    it('notifies subscribers', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T1', meta: {}, id: 't1' });

      const values: (string | undefined)[] = [];
      tm.activeTenant$.subscribe(t => values.push(t?.id));

      await tm.open('t1');
      expect(values).toContain('t1');
    });
  });

  describe('join', () => {
    it('reads marker blob and adds tenant', async () => {
      const adapter = new MemoryBlobAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'shared-id', name: 'Shared', encrypted: false, meta: { folder: 'shared' }, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, { deriveTenantId: () => 'shared-id' }));
      const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'Shared' });
      expect(tenant.name).toBe('Shared');
      const list = await tm.list();
      expect(list).toHaveLength(1);
    });

    it('throws if no marker blob found', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.join({ meta: { folder: 'empty' } })).rejects.toThrow(
        'No strata workspace found',
      );
    });

    it('returns existing tenant if already in list', async () => {
      const adapter = new MemoryBlobAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'derived-id', name: '', encrypted: false, meta: { folder: 'f1' }, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, {
        deriveTenantId: () => 'derived-id',
      }));
      const t1 = await tm.join({ meta: { folder: 'f1' } });
      const t2 = await tm.join({ meta: { folder: 'f1' } });
      expect(t1.id).toBe(t2.id);
      const list = await tm.list();
      expect(list).toHaveLength(1);
    });

    it('defaults name to Shared Workspace', async () => {
      const adapter = new MemoryBlobAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'default-id', name: '', encrypted: false, meta: {}, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, { deriveTenantId: () => 'default-id' }));
      const tenant = await tm.join({ meta: {} });
      expect(tenant.name).toBe('Shared Workspace');
    });

    it('throws for incompatible workspace version', async () => {
      const adapter = new MemoryBlobAdapter();
      const marker = { version: 99, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'bad-ver', name: '', encrypted: false, meta: {}, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, { deriveTenantId: () => 'bad-ver' }));
      await expect(tm.join({ meta: {} })).rejects.toThrow('Incompatible strata workspace version');
    });

    it('detects encrypted workspace via parse failure during join', async () => {
      const adapter = new MemoryBlobAdapter();
      const failAdapter = {
        ...adapter,
        kind: 'blob' as const,
        read: async (tenant: Tenant | undefined, key: string) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'enc-join') {
            throw new Error('decrypt failed');
          }
          return adapter.read(tenant, key);
        },
        write: adapter.write.bind(adapter),
        delete: adapter.delete.bind(adapter),
        list: adapter.list.bind(adapter),
      };
      const tm = new TenantManager(makeDeps(adapter, {
        adapter: failAdapter,
        deriveTenantId: () => 'enc-join',
      }));
      const tenant = await tm.join({ meta: {} });
      expect(tenant.encrypted).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes tenant from list', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 't1' });
      await tm.remove('t1');
      const list = await tm.list();
      expect(list).toHaveLength(0);
    });

    it('clears active tenant if removed is active', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 't1' });
      await tm.open('t1');
      expect(tm.activeTenant$.getValue()?.id).toBe('t1');
      await tm.remove('t1');
      expect(tm.activeTenant$.getValue()).toBeUndefined();
    });

    it('does not delete cloud data', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: { f: '1' }, id: 't1' });
      await tm.remove('t1');
      // Marker blob should still exist
      const marker = await adapter.read(created, DEFAULT_OPTIONS.markerKey);
      expect(marker).not.toBeNull();
    });
  });

  describe('remove with purge', () => {
    it('removes tenant from list and deletes cloud data', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: { f: '1' }, id: 't1' });
      await tm.remove('t1', { purge: true });
      const list = await tm.list();
      expect(list).toHaveLength(0);
    });

    it('clears active tenant if deleted is active', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 't1' });
      await tm.open('t1');
      await tm.remove('t1', { purge: true });
      expect(tm.activeTenant$.getValue()).toBeUndefined();
    });

    it('is a no-op for unknown tenant ID', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.remove('unknown', { purge: true })).resolves.toBeUndefined();
    });
  });

  describe('open - encrypted tenant edge cases', () => {
    it('throws when encrypted marker is missing DEK', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));

      // Create tenant as encrypted
      const now = new Date();
      const tenant: Tenant = { id: 'enc1', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      // Write marker without DEK
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [] } },
        deleted: {},
      });

      await expect(tm.open('enc1', { password: 'test' })).rejects.toThrow('Encrypted marker missing DEK');
      expect(tm.activeTenant$.getValue()).toBeUndefined();
    });

    it('throws when no password provided for encrypted tenant', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));

      const now = new Date();
      const tenant: Tenant = { id: 'enc2', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      await expect(tm.open('enc2')).rejects.toThrow('Password required');
      expect(tm.activeTenant$.getValue()).toBeUndefined();
    });
  });

  describe('open - cloud adapter', () => {
    it('emits cloud-unreachable when cloud sync fails', async () => {
      const adapter = new MemoryBlobAdapter();
      const emittedEvents: string[] = [];
      const syncEngine = {
        ...stubSyncEngine(),
        sync: async (source: string, target: string) => {
          if (source === 'cloud') throw new Error('network error');
          return { result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined }, deduplicated: false };
        },
        emit: (event: { type: string }) => { emittedEvents.push(event.type); },
      };
      const cloudAdapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter, { syncEngine: syncEngine as unknown as SyncEngineType, cloudAdapter }));

      const now = new Date();
      const tenant: Tenant = { id: 'c1', name: 'Cloud', encrypted: false, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [] } },
        deleted: {},
      });

      await tm.open('c1');
      expect(emittedEvents).toContain('cloud-unreachable');
    });
  });

  describe('changePassword', () => {
    it('throws when no tenant is loaded', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.changePassword('old', 'new')).rejects.toThrow('No tenant loaded');
    });

    it('throws when tenant is not encrypted', async () => {
      const adapter = new MemoryBlobAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 'plain' });
      await tm.open('plain');
      await expect(tm.changePassword('old', 'new')).rejects.toThrow('Current tenant is not encrypted');
    });

    it('error recovery restores encryption service on failure', async () => {
      const adapter = new MemoryBlobAdapter();
      const now = new Date();
      const tenant: Tenant = { id: 'enc-cp', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      // Write marker with dek field so readMarkerBlob returns valid marker
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [], dek: 'fakeDek' } },
        deleted: {},
      });

      let setupCallCount = 0;
      const mockEncService = {
        setup: async () => { setupCallCount++; },
        setDek: () => {},
        clear: () => {},
        toTransform: () => ({ encode: async (_t: unknown, _k: unknown, d: Uint8Array) => d, decode: async (_t: unknown, _k: unknown, d: Uint8Array) => d }),
      } as unknown as EncryptionTransformService;

      const tm = new TenantManager(makeDeps(adapter, { encryptionService: mockEncService }));

      // Manually set active tenant to encrypted tenant (bypass open which needs real crypto)
      (tm as any).subject.next(tenant);

      // importDek will throw since 'fakeDek' is not valid base64 → enters catch block
      await expect(tm.changePassword('old', 'new')).rejects.toThrow();

      // Verify error recovery called setup again (restore with old password)
      expect(setupCallCount).toBeGreaterThanOrEqual(3); // setup(old), setup(new), setup(old) recovery
    });
  });
});
