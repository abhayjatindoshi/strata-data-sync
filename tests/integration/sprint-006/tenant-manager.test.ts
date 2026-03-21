import { describe, it, expect } from 'vitest';
import { createTenantManager } from '../../../src/tenant/index.js';
import { createEntityStore } from '../../../src/store/index.js';
import { createMemoryBlobAdapter } from '../../../src/persistence/index.js';

function setup() {
  const store = createEntityStore();
  const localAdapter = createMemoryBlobAdapter();
  const manager = createTenantManager({
    store,
    localAdapter,
    deviceId: 'test-device',
  });
  return { store, localAdapter, manager };
}

describe('Integration: TenantManager', () => {
  describe('create', () => {
    it('creates a tenant with generated id and base fields', async () => {
      const { manager } = setup();
      const tenant = await manager.create({ name: 'Acme Corp' });

      expect(tenant.id).toBeDefined();
      expect(tenant.id.length).toBeGreaterThan(0);
      expect(tenant.name).toBe('Acme Corp');
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
      expect(tenant.version).toBe(1);
      expect(tenant.device).toBe('test-device');
    });

    it('creates multiple tenants with unique ids', async () => {
      const { manager } = setup();
      const t1 = await manager.create({ name: 'Org A' });
      const t2 = await manager.create({ name: 'Org B' });

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('list', () => {
    it('returns empty list when no tenants exist', async () => {
      const { manager } = setup();
      const tenants = await manager.list();
      expect(tenants).toHaveLength(0);
    });

    it('returns all created tenants', async () => {
      const { manager } = setup();
      await manager.create({ name: 'Org A' });
      await manager.create({ name: 'Org B' });

      const tenants = await manager.list();
      expect(tenants).toHaveLength(2);
      expect(tenants.map((t) => t.name)).toContain('Org A');
      expect(tenants.map((t) => t.name)).toContain('Org B');
    });
  });

  describe('load', () => {
    it('sets the active tenant', async () => {
      const { manager } = setup();
      const tenant = await manager.create({ name: 'Acme' });

      await manager.load(tenant.id);
      expect(manager.activeTenant$.getValue()).toBeDefined();
      expect(manager.activeTenant$.getValue()!.id).toBe(tenant.id);
    });

    it('throws when tenant not found', async () => {
      const { manager } = setup();
      await expect(manager.load('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('switch', () => {
    it('changes the active tenant', async () => {
      const { manager } = setup();
      const t1 = await manager.create({ name: 'Org A' });
      const t2 = await manager.create({ name: 'Org B' });

      await manager.load(t1.id);
      expect(manager.activeTenant$.getValue()!.id).toBe(t1.id);

      await manager.switch(t2.id);
      expect(manager.activeTenant$.getValue()!.id).toBe(t2.id);
    });

    it('throws when switching to nonexistent tenant', async () => {
      const { manager } = setup();
      await expect(manager.switch('bad-id')).rejects.toThrow('Tenant not found');
    });
  });

  describe('observable active tenant', () => {
    it('starts with undefined', () => {
      const { manager } = setup();
      expect(manager.activeTenant$.getValue()).toBeUndefined();
    });

    it('emits tenant on load', async () => {
      const { manager } = setup();
      const emissions: unknown[] = [];
      manager.activeTenant$.subscribe((v) => emissions.push(v));

      const tenant = await manager.create({ name: 'Test' });
      await manager.load(tenant.id);

      expect(emissions).toHaveLength(2);
      expect(emissions[0]).toBeUndefined();
      expect((emissions[1] as { name: string }).name).toBe('Test');
    });

    it('emits on switch', async () => {
      const { manager } = setup();
      const t1 = await manager.create({ name: 'A' });
      const t2 = await manager.create({ name: 'B' });

      const names: (string | undefined)[] = [];
      manager.activeTenant$.subscribe((v) => names.push(v?.name));

      await manager.load(t1.id);
      await manager.switch(t2.id);

      expect(names).toEqual([undefined, 'A', 'B']);
    });
  });
});
