import { describe, it, expect } from 'vitest';
import { createTenantManager } from './tenant-manager.js';
import { createEntityStore } from '../store/index.js';
import { createMemoryBlobAdapter } from '../persistence/index.js';

function setup() {
  const store = createEntityStore();
  const localAdapter = createMemoryBlobAdapter();
  const manager = createTenantManager({
    store,
    localAdapter,
    deviceId: 'dev-1',
  });
  return { manager, store, localAdapter };
}

describe('createTenantManager', () => {
  describe('list', () => {
    it('returns empty array when no tenants exist', async () => {
      const { manager } = setup();
      const tenants = await manager.list();
      expect(tenants).toEqual([]);
    });

    it('returns created tenants', async () => {
      const { manager } = setup();
      await manager.create({ name: 'Workspace A' });
      await manager.create({ name: 'Workspace B' });
      const tenants = await manager.list();
      expect(tenants).toHaveLength(2);
      expect(tenants.map((t) => t.name).sort()).toEqual(['Workspace A', 'Workspace B']);
    });
  });

  describe('create', () => {
    it('creates a tenant with base fields', async () => {
      const { manager } = setup();
      const tenant = await manager.create({ name: 'My Workspace' });

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe('My Workspace');
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
      expect(tenant.version).toBe(1);
      expect(tenant.device).toBe('dev-1');
    });

    it('persists the tenant to the adapter', async () => {
      const { manager, localAdapter } = setup();
      await manager.create({ name: 'Persisted' });

      const data = await localAdapter.read('__tenants');
      expect(data).not.toBeNull();
    });
  });

  describe('load', () => {
    it('sets active tenant', async () => {
      const { manager } = setup();
      const tenant = await manager.create({ name: 'Test' });
      await manager.load(tenant.id);

      expect(manager.activeTenant$.getValue()).toBeDefined();
      expect(manager.activeTenant$.getValue()!.id).toBe(tenant.id);
    });

    it('throws for non-existent tenant', async () => {
      const { manager } = setup();
      await expect(manager.load('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('switch', () => {
    it('switches active tenant', async () => {
      const { manager } = setup();
      const t1 = await manager.create({ name: 'First' });
      const t2 = await manager.create({ name: 'Second' });

      await manager.load(t1.id);
      expect(manager.activeTenant$.getValue()!.id).toBe(t1.id);

      await manager.switch(t2.id);
      expect(manager.activeTenant$.getValue()!.id).toBe(t2.id);
    });

    it('throws for non-existent tenant on switch', async () => {
      const { manager } = setup();
      const t1 = await manager.create({ name: 'First' });
      await manager.load(t1.id);
      await expect(manager.switch('bad-id')).rejects.toThrow('Tenant not found');
    });
  });

  describe('activeTenant$', () => {
    it('starts as undefined', () => {
      const { manager } = setup();
      expect(manager.activeTenant$.getValue()).toBeUndefined();
    });

    it('emits tenant on load', async () => {
      const { manager } = setup();
      const values: unknown[] = [];
      manager.activeTenant$.subscribe((v) => values.push(v));

      const tenant = await manager.create({ name: 'Observable' });
      await manager.load(tenant.id);

      expect(values).toHaveLength(2); // undefined, then tenant
      expect(values[0]).toBeUndefined();
      expect((values[1] as { name: string }).name).toBe('Observable');
    });

    it('emits on switch', async () => {
      const { manager } = setup();
      const t1 = await manager.create({ name: 'One' });
      const t2 = await manager.create({ name: 'Two' });
      await manager.load(t1.id);

      const values: unknown[] = [];
      manager.activeTenant$.subscribe((v) => values.push(v));

      await manager.switch(t2.id);
      expect(values).toHaveLength(2);
      expect((values[0] as { name: string }).name).toBe('One');
      expect((values[1] as { name: string }).name).toBe('Two');
    });
  });
});
