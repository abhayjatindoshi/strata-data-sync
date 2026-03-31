import { DEFAULT_OPTIONS } from '../helpers';
import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';
import { mergeTenantLists, pushTenantList, pullTenantList } from '@strata/tenant';
import { saveTenantPrefs, loadTenantPrefs } from '@strata/tenant';
import { saveTenantList, loadTenantList } from '@strata/tenant';
import type { Tenant } from '@strata/tenant';

function makeTenant(overrides: Partial<Tenant> & { id: string; name: string }): Tenant {
  const now = new Date('2026-03-23T12:00:00Z');
  return {
    encrypted: false,
    meta: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('mergeTenantLists', () => {
  it('returns union by tenant ID', () => {
    const local = [makeTenant({ id: 't1', name: 'Local 1' })];
    const remote = [makeTenant({ id: 't2', name: 'Remote 2' })];
    const merged = mergeTenantLists(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.map(t => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('keeps entry with latest updatedAt for matching IDs', () => {
    const older = makeTenant({ id: 't1', name: 'Old', updatedAt: new Date('2026-03-01T00:00:00Z') });
    const newer = makeTenant({ id: 't1', name: 'New', updatedAt: new Date('2026-03-23T00:00:00Z') });
    const merged = mergeTenantLists([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('New');
  });

  it('keeps local entry when it is newer', () => {
    const newer = makeTenant({ id: 't1', name: 'Local', updatedAt: new Date('2026-03-23T00:00:00Z') });
    const older = makeTenant({ id: 't1', name: 'Remote', updatedAt: new Date('2026-03-01T00:00:00Z') });
    const merged = mergeTenantLists([newer], [older]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Local');
  });

  it('handles empty local list', () => {
    const remote = [makeTenant({ id: 't1', name: 'R' })];
    expect(mergeTenantLists([], remote)).toHaveLength(1);
  });

  it('handles empty remote list', () => {
    const local = [makeTenant({ id: 't1', name: 'L' })];
    expect(mergeTenantLists(local, [])).toHaveLength(1);
  });

  it('handles both empty', () => {
    expect(mergeTenantLists([], [])).toHaveLength(0);
  });
});

describe('pushTenantList', () => {
  it('copies local tenant list to cloud adapter', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const now = new Date();
    await saveTenantList(localAdapter, [
      makeTenant({ id: 't1', name: 'Test', updatedAt: now }),
    ], DEFAULT_OPTIONS);

    await pushTenantList(localAdapter, cloudAdapter, DEFAULT_OPTIONS);

    const cloudList = await loadTenantList(cloudAdapter, DEFAULT_OPTIONS);
    expect(cloudList).toHaveLength(1);
    expect(cloudList[0].id).toBe('t1');
  });

  it('handles empty local list', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();

    await pushTenantList(localAdapter, cloudAdapter, DEFAULT_OPTIONS);

    const cloudList = await loadTenantList(cloudAdapter, DEFAULT_OPTIONS);
    expect(cloudList).toHaveLength(0);
  });
});

describe('pullTenantList', () => {
  it('merges cloud tenants into local list', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    await saveTenantList(localAdapter, [
      makeTenant({ id: 't1', name: 'Local' }),
    ], DEFAULT_OPTIONS);
    await saveTenantList(cloudAdapter, [
      makeTenant({ id: 't2', name: 'Cloud' }),
    ], DEFAULT_OPTIONS);

    await pullTenantList(localAdapter, cloudAdapter, DEFAULT_OPTIONS);

    const localList = await loadTenantList(localAdapter, DEFAULT_OPTIONS);
    expect(localList).toHaveLength(2);
    expect(localList.map(t => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('takes newer entry on conflict', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    await saveTenantList(localAdapter, [
      makeTenant({ id: 't1', name: 'OldLocal', updatedAt: new Date('2026-01-01') }),
    ], DEFAULT_OPTIONS);
    await saveTenantList(cloudAdapter, [
      makeTenant({ id: 't1', name: 'NewCloud', updatedAt: new Date('2026-03-23') }),
    ], DEFAULT_OPTIONS);

    await pullTenantList(localAdapter, cloudAdapter, DEFAULT_OPTIONS);

    const localList = await loadTenantList(localAdapter, DEFAULT_OPTIONS);
    expect(localList).toHaveLength(1);
    expect(localList[0].name).toBe('NewCloud');
  });
});

describe('saveTenantPrefs', () => {
  it('saves and loads prefs round-trip', async () => {
    const adapter = new MemoryBlobAdapter();
    const tenant = makeTenant({ id: 'prefs-t1', name: 'Test', meta: { folder: 'test-folder' } });

    await saveTenantPrefs(adapter, tenant, { name: 'My Tenant' });
    const prefs = await loadTenantPrefs(adapter, tenant);

    expect(prefs).toBeDefined();
    expect(prefs!.name).toBe('My Tenant');
  });
});

describe('loadTenantPrefs', () => {
  it('returns undefined when no prefs blob exists', async () => {
    const adapter = new MemoryBlobAdapter();
    const tenant = makeTenant({ id: 'none', name: 'None', meta: { folder: 'nonexistent' } });
    const prefs = await loadTenantPrefs(adapter, tenant);
    expect(prefs).toBeUndefined();
  });

  it('loads prefs without optional fields', async () => {
    const adapter = new MemoryBlobAdapter();
    const tenant = makeTenant({ id: 'plain-t', name: 'Plain', meta: { folder: 'test' } });
    await saveTenantPrefs(adapter, tenant, { name: 'Plain' });
    const prefs = await loadTenantPrefs(adapter, tenant);
    expect(prefs).toBeDefined();
    expect(prefs!.name).toBe('Plain');
  });
});
