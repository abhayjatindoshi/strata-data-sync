import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '@strata/adapter';
import { mergeTenantLists, pushTenantList, pullTenantList } from '@strata/tenant';
import { saveTenantPrefs, loadTenantPrefs } from '@strata/tenant';
import { saveTenantList, loadTenantList } from '@strata/tenant';
import type { Tenant } from '@strata/tenant';

function makeTenant(overrides: Partial<Tenant> & { id: string; name: string }): Tenant {
  const now = new Date('2026-03-23T12:00:00Z');
  return {
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
    ]);

    await pushTenantList(localAdapter, cloudAdapter);

    const cloudList = await loadTenantList(cloudAdapter);
    expect(cloudList).toHaveLength(1);
    expect(cloudList[0].id).toBe('t1');
  });

  it('handles empty local list', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();

    await pushTenantList(localAdapter, cloudAdapter);

    const cloudList = await loadTenantList(cloudAdapter);
    expect(cloudList).toHaveLength(0);
  });
});

describe('pullTenantList', () => {
  it('merges cloud tenants into local list', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    await saveTenantList(localAdapter, [
      makeTenant({ id: 't1', name: 'Local' }),
    ]);
    await saveTenantList(cloudAdapter, [
      makeTenant({ id: 't2', name: 'Cloud' }),
    ]);

    await pullTenantList(localAdapter, cloudAdapter);

    const localList = await loadTenantList(localAdapter);
    expect(localList).toHaveLength(2);
    expect(localList.map(t => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('takes newer entry on conflict', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    await saveTenantList(localAdapter, [
      makeTenant({ id: 't1', name: 'OldLocal', updatedAt: new Date('2026-01-01') }),
    ]);
    await saveTenantList(cloudAdapter, [
      makeTenant({ id: 't1', name: 'NewCloud', updatedAt: new Date('2026-03-23') }),
    ]);

    await pullTenantList(localAdapter, cloudAdapter);

    const localList = await loadTenantList(localAdapter);
    expect(localList).toHaveLength(1);
    expect(localList[0].name).toBe('NewCloud');
  });
});

describe('saveTenantPrefs', () => {
  it('saves and loads prefs round-trip', async () => {
    const adapter = new MemoryBlobAdapter();
    const meta = { folder: 'test-folder' };

    await saveTenantPrefs(adapter, meta, { name: 'My Tenant', icon: 'star', color: '#ff0000' });
    const prefs = await loadTenantPrefs(adapter, meta);

    expect(prefs).toBeDefined();
    expect(prefs!.name).toBe('My Tenant');
    expect(prefs!.icon).toBe('star');
    expect(prefs!.color).toBe('#ff0000');
  });
});

describe('loadTenantPrefs', () => {
  it('returns undefined when no prefs blob exists', async () => {
    const adapter = new MemoryBlobAdapter();
    const prefs = await loadTenantPrefs(adapter, { folder: 'nonexistent' });
    expect(prefs).toBeUndefined();
  });

  it('loads prefs without optional fields', async () => {
    const adapter = new MemoryBlobAdapter();
    const meta = { folder: 'test' };
    await saveTenantPrefs(adapter, meta, { name: 'Plain' });
    const prefs = await loadTenantPrefs(adapter, meta);
    expect(prefs).toBeDefined();
    expect(prefs!.name).toBe('Plain');
    expect(prefs!.icon).toBeUndefined();
    expect(prefs!.color).toBeUndefined();
  });
});
