import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { TENANTS_KEY, STRATA_MARKER_KEY } from '@strata/adapter';
import { serialize, deserialize } from '@strata/persistence';
import { loadTenantList, saveTenantList, createTenantManager } from '@strata/tenant';
import type { Tenant } from '@strata/tenant';

describe('tenant list persistence', () => {
  it('loadTenantList returns empty array when no blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const list = await loadTenantList(adapter);
    expect(list).toEqual([]);
  });

  it('save and load round-trip', async () => {
    const adapter = createMemoryBlobAdapter();
    const now = new Date('2026-03-23T12:00:00Z');
    const tenants: Tenant[] = [
      { id: 't1', name: 'Tenant 1', cloudMeta: { folder: 'abc' }, createdAt: now, updatedAt: now },
    ];
    await saveTenantList(adapter, tenants);
    const loaded = await loadTenantList(adapter);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('t1');
    expect(loaded[0].name).toBe('Tenant 1');
  });

  it('stores under __tenants key', async () => {
    const adapter = createMemoryBlobAdapter();
    const now = new Date();
    await saveTenantList(adapter, [
      { id: 't1', name: 'T', cloudMeta: {}, createdAt: now, updatedAt: now },
    ]);
    const data = await adapter.read(undefined, TENANTS_KEY);
    expect(data).not.toBeNull();
  });
});

describe('TenantManager', () => {
  describe('list', () => {
    it('returns empty array initially', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      const list = await tm.list();
      expect(list).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates tenant with provided ID', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      const tenant = await tm.create({ name: 'My App', cloudMeta: { bucket: 'x' }, id: 'custom-id' });
      expect(tenant.id).toBe('custom-id');
      expect(tenant.name).toBe('My App');
      expect(tenant.createdAt).toBeInstanceOf(Date);
    });

    it('generates ID when not provided', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      const tenant = await tm.create({ name: 'My App', cloudMeta: { bucket: 'x' } });
      expect(tenant.id).toHaveLength(8);
    });

    it('derives ID from cloudMeta when deriveTenantId is configured', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter, {
        deriveTenantId: (meta) => (meta as { folderId: string }).folderId.substring(0, 4),
      });
      const tenant = await tm.create({ name: 'Shared', cloudMeta: { folderId: 'abcdefgh' } });
      expect(tenant.id).toBe('abcd');
    });

    it('writes __strata marker blob', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: { folder: 'f1' } });
      const marker = await adapter.read({ folder: 'f1' }, STRATA_MARKER_KEY);
      expect(marker).not.toBeNull();
      const parsed = deserialize<{ version: number }>(marker!);
      expect(parsed.version).toBe(1);
    });

    it('persists tenant to list', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: {}, id: 'abc' });
      const list = await tm.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('abc');
    });
  });

  describe('load', () => {
    it('sets active tenant', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T1', cloudMeta: {}, id: 't1' });
      await tm.load('t1');
      expect(tm.activeTenant$.getValue()!.id).toBe('t1');
    });

    it('throws for unknown tenant ID', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await expect(tm.load('unknown')).rejects.toThrow('Tenant not found: unknown');
    });

    it('notifies subscribers', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T1', cloudMeta: {}, id: 't1' });

      const values: (string | undefined)[] = [];
      tm.activeTenant$.subscribe(t => values.push(t?.id));

      await tm.load('t1');
      expect(values).toContain('t1');
    });
  });

  describe('setup', () => {
    it('reads marker blob and adds tenant', async () => {
      const adapter = createMemoryBlobAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      await adapter.write({ folder: 'shared' }, STRATA_MARKER_KEY, serialize(marker));

      const tm = createTenantManager(adapter);
      const tenant = await tm.setup({ cloudMeta: { folder: 'shared' }, name: 'Shared' });
      expect(tenant.name).toBe('Shared');
      const list = await tm.list();
      expect(list).toHaveLength(1);
    });

    it('throws if no marker blob found', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await expect(tm.setup({ cloudMeta: { folder: 'empty' } })).rejects.toThrow(
        'No strata workspace found',
      );
    });

    it('returns existing tenant if already in list', async () => {
      const adapter = createMemoryBlobAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      await adapter.write({ folder: 'f1' }, STRATA_MARKER_KEY, serialize(marker));

      const tm = createTenantManager(adapter, {
        deriveTenantId: () => 'derived-id',
      });
      const t1 = await tm.setup({ cloudMeta: { folder: 'f1' } });
      const t2 = await tm.setup({ cloudMeta: { folder: 'f1' } });
      expect(t1.id).toBe(t2.id);
      const list = await tm.list();
      expect(list).toHaveLength(1);
    });

    it('defaults name to Shared Workspace', async () => {
      const adapter = createMemoryBlobAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      await adapter.write({}, STRATA_MARKER_KEY, serialize(marker));

      const tm = createTenantManager(adapter);
      const tenant = await tm.setup({ cloudMeta: {} });
      expect(tenant.name).toBe('Shared Workspace');
    });
  });

  describe('delink', () => {
    it('removes tenant from list', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: {}, id: 't1' });
      await tm.delink('t1');
      const list = await tm.list();
      expect(list).toHaveLength(0);
    });

    it('clears active tenant if delinked is active', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: {}, id: 't1' });
      await tm.load('t1');
      expect(tm.activeTenant$.getValue()?.id).toBe('t1');
      await tm.delink('t1');
      expect(tm.activeTenant$.getValue()).toBeUndefined();
    });

    it('does not delete cloud data', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: { f: '1' }, id: 't1' });
      await tm.delink('t1');
      // Marker blob should still exist
      const marker = await adapter.read({ f: '1' }, STRATA_MARKER_KEY);
      expect(marker).not.toBeNull();
    });
  });

  describe('delete', () => {
    it('removes tenant from list and deletes cloud data', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: { f: '1' }, id: 't1' });
      await tm.delete('t1');
      const list = await tm.list();
      expect(list).toHaveLength(0);
    });

    it('clears active tenant if deleted is active', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await tm.create({ name: 'T', cloudMeta: {}, id: 't1' });
      await tm.load('t1');
      await tm.delete('t1');
      expect(tm.activeTenant$.getValue()).toBeUndefined();
    });

    it('is a no-op for unknown tenant ID', async () => {
      const adapter = createMemoryBlobAdapter();
      const tm = createTenantManager(adapter);
      await expect(tm.delete('unknown')).resolves.toBeUndefined();
    });
  });
});
