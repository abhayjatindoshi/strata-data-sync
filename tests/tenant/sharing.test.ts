import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import type { Tenant } from '@strata/adapter';
import {
  createTenantManager,
  writeMarkerBlob,
  saveTenantPrefs,
} from '@strata/tenant';

function makeTenant(id: string, meta: Record<string, unknown>): Tenant {
  return { id, name: '', meta, createdAt: new Date(), updatedAt: new Date() };
}

describe('Sharing flow', () => {
  it('setup reads marker blob and detects existing workspace', async () => {
    const adapter = createMemoryBlobAdapter();
    const tempTenant = makeTenant('shared-id', { folder: 'shared' });
    await writeMarkerBlob(adapter, tempTenant, ['transaction']);

    const tm = createTenantManager(adapter, { deriveTenantId: () => 'shared-id' });
    const tenant = await tm.setup({ meta: { folder: 'shared' }, name: 'Project X' });
    expect(tenant).toBeDefined();
    expect(tenant.name).toBe('Project X');
  });

  it('derives same tenant ID as creator via deriveTenantId', async () => {
    const deriveFn = (meta: Record<string, unknown>) =>
      (meta as { folderId: string }).folderId.substring(0, 4);

    // User A creates
    const adapterA = createMemoryBlobAdapter();
    const tmA = createTenantManager(adapterA, { deriveTenantId: deriveFn });
    const tenantA = await tmA.create({ name: 'Project X', meta: { folderId: 'abc12345' } });

    // User B sets up (separate adapter simulating separate device, marker blob must exist)
    const adapterB = createMemoryBlobAdapter();
    const tenantRefB = makeTenant('abc1', { folderId: 'abc12345' });
    await writeMarkerBlob(adapterB, tenantRefB, []);
    const tmB = createTenantManager(adapterB, { deriveTenantId: deriveFn });
    const tenantB = await tmB.setup({ meta: { folderId: 'abc12345' } });

    expect(tenantA.id).toBe('abc1');
    expect(tenantB.id).toBe('abc1');
    expect(tenantA.id).toBe(tenantB.id);
  });

  it('merges tenant prefs into local list', async () => {
    const adapter = createMemoryBlobAdapter();
    const tempTenant = makeTenant('prefs-id', { folder: 'shared' });

    await writeMarkerBlob(adapter, tempTenant, []);
    await saveTenantPrefs(adapter, tempTenant, { name: 'Team Project', icon: '🚀', color: '#ff0000' });

    const tm = createTenantManager(adapter, { deriveTenantId: () => 'prefs-id' });
    const tenant = await tm.setup({ meta: { folder: 'shared' } });

    expect(tenant.name).toBe('Team Project');
    expect(tenant.icon).toBe('🚀');
    expect(tenant.color).toBe('#ff0000');
  });

  it('prefs name takes precedence over opts.name', async () => {
    const adapter = createMemoryBlobAdapter();
    const tempTenant = makeTenant('prefs-id2', { folder: 'shared' });

    await writeMarkerBlob(adapter, tempTenant, []);
    await saveTenantPrefs(adapter, tempTenant, { name: 'From Prefs' });

    const tm = createTenantManager(adapter, { deriveTenantId: () => 'prefs-id2' });
    const tenant = await tm.setup({ meta: { folder: 'shared' }, name: 'From Opts' });

    expect(tenant.name).toBe('From Prefs');
  });

  it('rejects location without valid marker blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const tm = createTenantManager(adapter, { deriveTenantId: () => 'no-data' });

    await expect(tm.setup({ meta: { folder: 'empty' } })).rejects.toThrow(
      'No strata workspace found',
    );
  });

  it('rejects location with incompatible marker blob version', async () => {
    const adapter = createMemoryBlobAdapter();
    const tempTenant = makeTenant('bad-ver', {});
    const marker = { version: 99, createdAt: new Date(), entityTypes: [] };
    await adapter.write(tempTenant, STRATA_MARKER_KEY, { __system: { marker }, deleted: {} });

    const tm = createTenantManager(adapter, { deriveTenantId: () => 'bad-ver' });
    await expect(tm.setup({ meta: {} })).rejects.toThrow(
      'Incompatible strata workspace version',
    );
  });

  it('create writes marker blob with entity types', async () => {
    const adapter = createMemoryBlobAdapter();
    const tm = createTenantManager(adapter, { entityTypes: ['transaction', 'account'] });

    const created = await tm.create({ name: 'My App', meta: { bucket: 'x' } });

    const { readMarkerBlob } = await import('@strata/tenant');
    const marker = await readMarkerBlob(adapter, created);
    expect(marker).toBeDefined();
    expect(marker!.entityTypes).toEqual(['transaction', 'account']);
  });
});
