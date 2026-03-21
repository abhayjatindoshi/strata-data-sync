import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus } from '../../../src/reactive/index.js';
import type { EntityEvent } from '../../../src/reactive/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import { dateKeyStrategy } from '../../../src/key-strategy/index.js';
import { createRepository } from '../../../src/repository/repository.js';
import { createMemoryBlobAdapter } from '../../../src/persistence/index.js';
import { createTenantManager, scopeStore } from '../../../src/tenant/index.js';

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

describe('Integration: End-to-End Tenant → Repository → Query', () => {
  it('creates tenants, scopes repositories, and queries with filters', async () => {
    const { store, bus } = createWiredStore();
    const localAdapter = createMemoryBlobAdapter();

    const manager = createTenantManager({
      store,
      localAdapter,
      deviceId: 'e2e-device',
    });

    // Create two tenants
    const tenantA = await manager.create({ name: 'Company A' });
    const tenantB = await manager.create({ name: 'Company B' });

    // Verify both tenants listed
    const allTenants = await manager.list();
    expect(allTenants).toHaveLength(2);

    // Load tenant A and create a scoped repository
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

    // Save invoices for tenant A
    await repoA.save({ customer: 'Alice', amount: 100, status: 'paid' });
    await repoA.save({ customer: 'Bob', amount: 200, status: 'pending' });
    await repoA.save({ customer: 'Charlie', amount: 50, status: 'paid' });

    // Switch to tenant B
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

    // Save invoices for tenant B
    await repoB.save({ customer: 'Dave', amount: 300, status: 'paid' });
    await repoB.save({ customer: 'Eve', amount: 150, status: 'pending' });

    // Query tenant A: filter paid invoices sorted by amount ascending
    const paidA = await repoA.getAll({
      where: { status: 'paid' },
      orderBy: [{ field: 'amount', direction: 'asc' }],
    });
    expect(paidA).toHaveLength(2);
    expect(paidA[0].customer).toBe('Charlie');
    expect(paidA[0].amount).toBe(50);
    expect(paidA[1].customer).toBe('Alice');
    expect(paidA[1].amount).toBe(100);

    // Query tenant B: all invoices sorted by amount descending
    const allB = await repoB.getAll({
      orderBy: [{ field: 'amount', direction: 'desc' }],
    });
    expect(allB).toHaveLength(2);
    expect(allB[0].amount).toBe(300);
    expect(allB[1].amount).toBe(150);

    // Cross-tenant isolation: tenant B should not see tenant A's data
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

    // Set up an observable with a filter
    const pending$ = repo.observeAll({ where: { status: 'pending' } });
    expect(pending$.getValue()).toHaveLength(1);

    // Add another pending invoice — the observable should update
    await repo.save({ customer: 'Grace', amount: 250, status: 'pending' });
    expect(pending$.getValue()).toHaveLength(2);

    // Add a paid invoice — pending observable should stay at 2
    await repo.save({ customer: 'Hank', amount: 100, status: 'paid' });
    // Note: The observable re-evaluates on any entity event for that entity name,
    // but the where filter should ensure only pending items are returned
    const pendingSnapshot = pending$.getValue();
    expect(pendingSnapshot.every((inv) => inv.status === 'pending')).toBe(true);
  });
});
