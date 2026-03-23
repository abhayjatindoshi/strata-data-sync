import { describe, it, expect, beforeEach } from 'vitest';
import { firstValueFrom, skip, take } from 'rxjs';
import { MemoryBlobAdapter } from '@strata/adapter';
import { createTenantManager } from '@strata/tenant/tenant-manager.js';
import { deriveTenantId } from '@strata/tenant/derive-tenant-id.js';
import { writeMarkerBlob, writeTenantList } from '@strata/tenant/tenant-storage.js';
import type { Tenant } from '@strata/tenant/types.js';

function makeMeta(name: string): Readonly<Record<string, unknown>> {
  return { bucket: `bucket-${name}` };
}

describe('createTenantManager', () => {
  let local: MemoryBlobAdapter;
  let cloud: MemoryBlobAdapter;

  beforeEach(() => {
    local = new MemoryBlobAdapter();
    cloud = new MemoryBlobAdapter();
  });

  describe('list', () => {
    it('returns empty list initially', async () => {
      const mgr = createTenantManager(local, cloud);
      const result = await mgr.list();
      expect(result).toEqual([]);
      mgr.dispose();
    });
  });

  describe('create', () => {
    it('creates a tenant and adds to list', async () => {
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'My Workspace',
        cloudMeta: makeMeta('ws1'),
      });

      expect(tenant.name).toBe('My Workspace');
      expect(tenant.id).toBeTruthy();
      expect(tenant.createdAt).toBeInstanceOf(Date);

      const list = await mgr.list();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe(tenant.id);
      mgr.dispose();
    });

    it('uses provided id when given', async () => {
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'Custom',
        cloudMeta: makeMeta('ws2'),
        id: 'custom-id',
      });
      expect(tenant.id).toBe('custom-id');
      mgr.dispose();
    });

    it('derives id from cloudMeta by default', async () => {
      const meta = makeMeta('ws3');
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({ name: 'Auto', cloudMeta: meta });
      expect(tenant.id).toBe(deriveTenantId(meta));
      mgr.dispose();
    });

    it('preserves optional fields', async () => {
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'Fancy',
        cloudMeta: makeMeta('ws4'),
        icon: '🏢',
        color: '#00ff00',
      });
      expect(tenant.icon).toBe('🏢');
      expect(tenant.color).toBe('#00ff00');
      mgr.dispose();
    });
  });

  describe('setup', () => {
    it('reads marker and merges tenant lists', async () => {
      const meta = makeMeta('shared');
      await writeMarkerBlob(cloud, meta);

      const existing: Tenant = {
        id: deriveTenantId(meta),
        name: 'Shared',
        cloudMeta: meta,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      await writeTenantList(cloud, meta, [existing]);

      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.setup({ cloudMeta: meta });
      expect(tenant.id).toBe(existing.id);

      const list = await mgr.list();
      expect(list).toHaveLength(1);
      mgr.dispose();
    });

    it('throws when no marker exists', async () => {
      const mgr = createTenantManager(local, cloud);
      await expect(mgr.setup({ cloudMeta: makeMeta('empty') }))
        .rejects.toThrow('No strata marker');
      mgr.dispose();
    });
  });

  describe('load', () => {
    it('sets active tenant and emits on observable', async () => {
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'Active',
        cloudMeta: makeMeta('active'),
      });

      const nextValue = firstValueFrom(mgr.activeTenant$.pipe(skip(1), take(1)));
      await mgr.load(tenant.id);
      const active = await nextValue;
      expect(active?.id).toBe(tenant.id);
      mgr.dispose();
    });

    it('throws for unknown tenant id', async () => {
      const mgr = createTenantManager(local, cloud);
      await expect(mgr.load('nonexistent'))
        .rejects.toThrow('Tenant not found');
      mgr.dispose();
    });
  });

  describe('delink', () => {
    it('removes tenant from list but keeps data', async () => {
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'ToDelink',
        cloudMeta: makeMeta('delink'),
      });

      await mgr.delink(tenant.id);
      const list = await mgr.list();
      expect(list).toHaveLength(0);
      mgr.dispose();
    });

    it('clears active tenant if delinked', async () => {
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'Active',
        cloudMeta: makeMeta('delink-active'),
      });
      await mgr.load(tenant.id);

      const nullValue = firstValueFrom(
        mgr.activeTenant$.pipe(skip(1), take(1)),
      );
      await mgr.delink(tenant.id);
      const result = await nullValue;
      expect(result).toBeNull();
      mgr.dispose();
    });
  });

  describe('delete', () => {
    it('removes tenant from list and deletes cloud data', async () => {
      const meta = makeMeta('deleteMe');
      const mgr = createTenantManager(local, cloud);
      const tenant = await mgr.create({
        name: 'ToDelete',
        cloudMeta: meta,
      });

      // Write some data in cloud
      const encoder = new TextEncoder();
      await cloud.write(meta, 'some-blob', encoder.encode('data'));

      await mgr.delete(tenant.id);

      const list = await mgr.list();
      expect(list).toHaveLength(0);

      // Cloud data should be cleaned up
      const remaining = await cloud.list(meta, '');
      expect(remaining).toHaveLength(0);
      mgr.dispose();
    });
  });

  describe('activeTenant$', () => {
    it('starts with null', async () => {
      const mgr = createTenantManager(local, cloud);
      const value = await firstValueFrom(mgr.activeTenant$);
      expect(value).toBeNull();
      mgr.dispose();
    });
  });
});
