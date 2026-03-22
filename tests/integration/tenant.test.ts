import { describe, it, expect } from 'vitest';
import { createEntityStore } from '@strata/store';
import { createEntityEventBus } from '@strata/reactive';
import type { StoreEntry } from '@strata/store';
import { defineEntity } from '@strata/schema';
import { dateKeyStrategy } from '@strata/key-strategy';
import { createRepository } from '@strata/repository/repository';
import { createMemoryBlobAdapter } from '@strata/persistence';
import {
  defineTenant,
  createTenantManager,
  scopeStore,
  scopeEntityKey,
  scopeMetadataKey,
  unscopeEntityKey,
  scopePrefix,
  TENANT_LIST_KEY,
} from '@strata/tenant';
import type { BaseTenant } from '@strata/tenant';

// ── Tenant Definition ───────────────────────────────────────────────
describe('Tenant Definition', () => {
  it('defineTenant returns an entity def with name __tenant', () => {
    const def = defineTenant();
    expect(def.name).toBe('__tenant');
  });

  it('BaseTenant includes id, name, createdAt, updatedAt, version, device', () => {
    const tenant: BaseTenant = {
      id: 'tenant-1',
      name: 'My Org',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
    };

    expect(tenant.id).toBe('tenant-1');
    expect(tenant.name).toBe('My Org');
    expect(tenant.createdAt).toBeInstanceOf(Date);
    expect(tenant.updatedAt).toBeInstanceOf(Date);
    expect(tenant.version).toBe(1);
    expect(tenant.device).toBe('dev-1');
  });

  it('defineTenant with custom fields preserves generic type', () => {
    type CustomFields = { plan: string; seats: number };
    const def = defineTenant<CustomFields>();
    expect(def.name).toBe('__tenant');
  });

  it('multiple calls to defineTenant produce independent defs', () => {
    const def1 = defineTenant();
    const def2 = defineTenant();
    expect(def1.name).toBe(def2.name);
  });
});

// ── Tenant Key Namespacing ──────────────────────────────────────────
describe('Tenant Key Namespacing', () => {
  describe('scopeEntityKey', () => {
    it('prepends tenant:{tenantId}: to entity key', () => {
      expect(scopeEntityKey('t1', 'Account.global')).toBe('tenant:t1:Account.global');
    });

    it('handles complex partition keys', () => {
      expect(scopeEntityKey('org-42', 'Transaction.2025-03')).toBe(
        'tenant:org-42:Transaction.2025-03',
      );
    });
  });

  describe('scopeMetadataKey', () => {
    it('returns tenant-scoped metadata key', () => {
      expect(scopeMetadataKey('t1')).toBe('tenant:t1:__metadata');
    });
  });

  describe('unscopeEntityKey', () => {
    it('extracts tenantId and entityKey from scoped key', () => {
      const result = unscopeEntityKey('tenant:t1:Account.global');
      expect(result).toEqual({ tenantId: 't1', entityKey: 'Account.global' });
    });

    it('returns undefined for unscoped key', () => {
      expect(unscopeEntityKey('Account.global')).toBeUndefined();
    });

    it('returns undefined for malformed scoped key', () => {
      expect(unscopeEntityKey('tenant:')).toBeUndefined();
    });

    it('handles tenant IDs with hyphens', () => {
      const result = unscopeEntityKey('tenant:my-org-123:Todo.2025');
      expect(result).toEqual({ tenantId: 'my-org-123', entityKey: 'Todo.2025' });
    });
  });

  describe('scopePrefix', () => {
    it('returns the prefix string for a tenant', () => {
      expect(scopePrefix('abc')).toBe('tenant:abc:');
    });
  });

  describe('TENANT_LIST_KEY', () => {
    it('is the well-known constant', () => {
      expect(TENANT_LIST_KEY).toBe('__tenants');
    });
  });
});

// ── TenantManager ───────────────────────────────────────────────────
function setupManager() {
  const store = createEntityStore();
  const localAdapter = createMemoryBlobAdapter();
  const manager = createTenantManager({
    store,
    localAdapter,
    deviceId: 'test-device',
  });
  return { store, localAdapter, manager };
}

describe('TenantManager', () => {
  describe('create', () => {
    it('creates a tenant with generated id and base fields', async () => {
      const { manager } = setupManager();
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
      const { manager } = setupManager();
      const t1 = await manager.create({ name: 'Org A' });
      const t2 = await manager.create({ name: 'Org B' });

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('list', () => {
    it('returns empty list when no tenants exist', async () => {
      const { manager } = setupManager();
      const tenants = await manager.list();
      expect(tenants).toHaveLength(0);
    });

    it('returns all created tenants', async () => {
      const { manager } = setupManager();
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
      const { manager } = setupManager();
      const tenant = await manager.create({ name: 'Acme' });

      await manager.load(tenant.id);
      expect(manager.activeTenant$.getValue()).toBeDefined();
      expect(manager.activeTenant$.getValue()!.id).toBe(tenant.id);
    });

    it('throws when tenant not found', async () => {
      const { manager } = setupManager();
      await expect(manager.load('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('switch', () => {
    it('changes the active tenant', async () => {
      const { manager } = setupManager();
      const t1 = await manager.create({ name: 'Org A' });
      const t2 = await manager.create({ name: 'Org B' });

      await manager.load(t1.id);
      expect(manager.activeTenant$.getValue()!.id).toBe(t1.id);

      await manager.switch(t2.id);
      expect(manager.activeTenant$.getValue()!.id).toBe(t2.id);
    });

    it('throws when switching to nonexistent tenant', async () => {
      const { manager } = setupManager();
      await expect(manager.switch('bad-id')).rejects.toThrow('Tenant not found');
    });
  });

  describe('observable active tenant', () => {
    it('starts with undefined', () => {
      const { manager } = setupManager();
      expect(manager.activeTenant$.getValue()).toBeUndefined();
    });

    it('emits tenant on load', async () => {
      const { manager } = setupManager();
      const emissions: unknown[] = [];
      manager.activeTenant$.subscribe((v) => emissions.push(v));

      const tenant = await manager.create({ name: 'Test' });
      await manager.load(tenant.id);

      expect(emissions).toHaveLength(2);
      expect(emissions[0]).toBeUndefined();
      expect((emissions[1] as { name: string }).name).toBe('Test');
    });

    it('emits on switch', async () => {
      const { manager } = setupManager();
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

// ── Tenant-Scoped Store ─────────────────────────────────────────────
function makeEntry(id: string, extra: Record<string, unknown> = {}): StoreEntry {
  return {
    id,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    version: 1,
    device: 'test',
    ...extra,
  };
}

describe('Tenant-Scoped Store', () => {
  describe('isolated CRUD', () => {
    it('save + get works through scoped store', () => {
      const base = createEntityStore();
      const scoped = scopeStore(base, 'tenant-1');
      const entry = makeEntry('Product.global.p1', { name: 'Widget' });

      scoped.save('Product.global', entry);
      const result = scoped.get('Product.global', 'Product.global.p1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('Product.global.p1');
      expect(result!['name']).toBe('Widget');
    });

    it('getAll returns all entities in scoped partition', () => {
      const base = createEntityStore();
      const scoped = scopeStore(base, 'tenant-1');

      scoped.save('Product.global', makeEntry('Product.global.p1'));
      scoped.save('Product.global', makeEntry('Product.global.p2'));
      scoped.save('Product.global', makeEntry('Product.global.p3'));

      expect(scoped.getAll('Product.global')).toHaveLength(3);
    });

    it('delete removes entity from scoped partition', () => {
      const base = createEntityStore();
      const scoped = scopeStore(base, 'tenant-1');
      scoped.save('Product.global', makeEntry('Product.global.p1'));

      expect(scoped.delete('Product.global', 'Product.global.p1')).toBe(true);
      expect(scoped.get('Product.global', 'Product.global.p1')).toBeUndefined();
    });

    it('listPartitions returns unscoped keys', () => {
      const base = createEntityStore();
      const scoped = scopeStore(base, 'tenant-1');

      scoped.createPartition('Order.2024');
      scoped.createPartition('Order.2025');

      const keys = scoped.listPartitions('Order');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('Order.2024');
      expect(keys).toContain('Order.2025');
    });
  });

  describe('cross-tenant isolation', () => {
    it('tenants do not see each others data', () => {
      const base = createEntityStore();
      const t1 = scopeStore(base, 'tenant-1');
      const t2 = scopeStore(base, 'tenant-2');

      t1.save('Product.global', makeEntry('Product.global.p1', { name: 'T1-Product' }));
      t2.save('Product.global', makeEntry('Product.global.p2', { name: 'T2-Product' }));

      expect(t1.getAll('Product.global')).toHaveLength(1);
      expect(t2.getAll('Product.global')).toHaveLength(1);
      expect(t1.get('Product.global', 'Product.global.p1')!['name']).toBe('T1-Product');
      expect(t2.get('Product.global', 'Product.global.p2')!['name']).toBe('T2-Product');
    });

    it('tenant cannot get entity from another tenant', () => {
      const base = createEntityStore();
      const t1 = scopeStore(base, 'tenant-1');
      const t2 = scopeStore(base, 'tenant-2');

      t1.save('Product.global', makeEntry('Product.global.p1'));

      expect(t2.get('Product.global', 'Product.global.p1')).toBeUndefined();
    });

    it('deleting in one tenant does not affect another', () => {
      const base = createEntityStore();
      const t1 = scopeStore(base, 'tenant-1');
      const t2 = scopeStore(base, 'tenant-2');

      t1.save('Product.global', makeEntry('Product.global.p1'));
      t2.save('Product.global', makeEntry('Product.global.p1'));

      t1.delete('Product.global', 'Product.global.p1');
      expect(t1.get('Product.global', 'Product.global.p1')).toBeUndefined();
      expect(t2.get('Product.global', 'Product.global.p1')).toBeDefined();
    });

    it('base store does not see scoped data directly', () => {
      const base = createEntityStore();
      const scoped = scopeStore(base, 'tenant-1');

      scoped.save('Product.global', makeEntry('Product.global.p1'));

      expect(base.getAll('Product.global')).toHaveLength(0);
      expect(base.listPartitions('Product')).toHaveLength(0);
    });

    it('listPartitions is isolated per tenant', () => {
      const base = createEntityStore();
      const t1 = scopeStore(base, 'tenant-1');
      const t2 = scopeStore(base, 'tenant-2');

      t1.createPartition('Order.2024');
      t1.createPartition('Order.2025');
      t2.createPartition('Order.2025');

      expect(t1.listPartitions('Order')).toHaveLength(2);
      expect(t2.listPartitions('Order')).toHaveLength(1);
    });
  });
});

// ── End-to-End Tenant → Repository → Query ──────────────────────────
type InvoiceFields = { customer: string; amount: number; status: string };
const Invoice = defineEntity<InvoiceFields>('Invoice');

function createWiredStore() {
  const bus = createEntityEventBus();
  const store = createEntityStore({
    onEntitySaved(entityKey, entity, isNew) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: isNew ? 'created' : 'updated',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: entity.id,
        entity: entity as Readonly<Record<string, unknown>>,
      });
    },
    onEntityDeleted(entityKey, id) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: 'deleted',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: id,
        entity: undefined,
      });
    },
  });
  return { store, bus };
}

describe('End-to-End Tenant → Repository → Query', () => {
  it('creates tenants, scopes repositories, and queries with filters', async () => {
    const { store, bus } = createWiredStore();
    const localAdapter = createMemoryBlobAdapter();

    const manager = createTenantManager({
      store,
      localAdapter,
      deviceId: 'e2e-device',
    });

    const tenantA = await manager.create({ name: 'Company A' });
    const tenantB = await manager.create({ name: 'Company B' });

    const allTenants = await manager.list();
    expect(allTenants).toHaveLength(2);

    await manager.load(tenantA.id);
    expect(manager.activeTenant$.getValue()!.id).toBe(tenantA.id);

    const scopedStoreA = scopeStore(store, tenantA.id, bus);
    const repoA = createRepository({
      entityDef: Invoice,
      store: scopedStoreA,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'e2e-device',
    });

    await repoA.save({ customer: 'Alice', amount: 100, status: 'paid' });
    await repoA.save({ customer: 'Bob', amount: 200, status: 'pending' });
    await repoA.save({ customer: 'Charlie', amount: 50, status: 'paid' });

    await manager.switch(tenantB.id);
    expect(manager.activeTenant$.getValue()!.id).toBe(tenantB.id);

    const scopedStoreB = scopeStore(store, tenantB.id, bus);
    const repoB = createRepository({
      entityDef: Invoice,
      store: scopedStoreB,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'e2e-device',
    });

    await repoB.save({ customer: 'Dave', amount: 300, status: 'paid' });
    await repoB.save({ customer: 'Eve', amount: 150, status: 'pending' });

    const paidA = await repoA.getAll({
      where: { status: 'paid' },
      orderBy: [{ field: 'amount', direction: 'asc' }],
    });
    expect(paidA).toHaveLength(2);
    expect(paidA[0].customer).toBe('Charlie');
    expect(paidA[0].amount).toBe(50);
    expect(paidA[1].customer).toBe('Alice');
    expect(paidA[1].amount).toBe(100);

    const allB = await repoB.getAll({
      orderBy: [{ field: 'amount', direction: 'desc' }],
    });
    expect(allB).toHaveLength(2);
    expect(allB[0].amount).toBe(300);
    expect(allB[1].amount).toBe(150);

    const allBNoFilter = await repoB.getAll();
    expect(allBNoFilter).toHaveLength(2);
    expect(allBNoFilter.every((inv) => inv.customer === 'Dave' || inv.customer === 'Eve')).toBe(true);
  });

  it('observeAll works with tenant-scoped repository and query filters', async () => {
    const { store, bus } = createWiredStore();
    const localAdapter = createMemoryBlobAdapter();

    const manager = createTenantManager({
      store,
      localAdapter,
      deviceId: 'e2e-device',
    });

    const tenant = await manager.create({ name: 'Observable Corp' });
    await manager.load(tenant.id);

    const scopedS = scopeStore(store, tenant.id, bus);
    const repo = createRepository({
      entityDef: Invoice,
      store: scopedS,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'e2e-device',
    });

    await repo.save({ customer: 'Frank', amount: 500, status: 'pending' });

    const pending$ = repo.observeAll({ where: { status: 'pending' } });
    expect(pending$.getValue()).toHaveLength(1);

    await repo.save({ customer: 'Grace', amount: 250, status: 'pending' });
    expect(pending$.getValue()).toHaveLength(2);

    await repo.save({ customer: 'Hank', amount: 100, status: 'paid' });
    const pendingSnapshot = pending$.getValue();
    expect(pendingSnapshot.every((inv) => inv.status === 'pending')).toBe(true);
  });
});
