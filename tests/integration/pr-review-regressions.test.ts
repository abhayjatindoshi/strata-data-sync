/**
 * Regression tests for bugs found in PR #1 review.
 * Each test exercises the exact condition that triggered the bug.
 */
import { describe, it, expect } from 'vitest';
import { createEntityStore } from '@strata/store';
import { createEntityEventBus } from '@strata/reactive';
import { defineEntity } from '@strata/schema';
import { dateKeyStrategy } from '@strata/key-strategy';
import { createRepository } from '@strata/repository/repository';
import {
  createMemoryBlobAdapter,
  storePartition,
} from '@strata/persistence';
import { createTenantManager } from '@strata/tenant/tenant-manager';

// ── Shared helpers ──────────────────────────────────────────────────
type ItemFields = { title: string; done: boolean };
const Item = defineEntity<ItemFields>('Item');

function makeKeyStrategy() {
  return dateKeyStrategy({ period: 'year' });
}

function setupRepo(opts?: { localAdapter?: ReturnType<typeof createMemoryBlobAdapter> }) {
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
  const adapter = opts?.localAdapter ?? createMemoryBlobAdapter();

  const repo = createRepository({
    entityDef: Item,
    store,
    eventBus: bus,
    keyStrategy: makeKeyStrategy(),
    deviceId: 'dev-1',
    localAdapter: adapter,
  });

  return { repo, store, bus, adapter };
}

// ── #3: save()/delete() must load partition first ───────────────────
describe('PR-review #3: save/delete load partition before acting', () => {
  it('save() preserves version and createdAt from persisted data', async () => {
    const adapter = createMemoryBlobAdapter();
    const now = new Date('2025-01-15T12:00:00Z');

    // Seed the adapter with an existing entity (simulating prior persistence)
    await storePartition(adapter, Item, '2025', [
      {
        id: 'Item.2025.abc',
        title: 'Original',
        done: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        version: 3,
        device: 'old-device',
      },
    ]);

    // Create a fresh repo — no prior get() call
    const { repo } = setupRepo({ localAdapter: adapter });

    // Save an update without ever calling get() first
    await repo.save({ id: 'Item.2025.abc', title: 'Updated', done: true } as ItemFields & { id: string });

    const entity = await repo.get('Item.2025.abc');
    expect(entity).toBeDefined();
    expect(entity!.title).toBe('Updated');
    // Bug: without ensurePartitionLoaded, version would be 1 instead of 4
    expect(entity!.version).toBe(4);
  });

  it('delete() finds entity that exists only in adapter', async () => {
    const adapter = createMemoryBlobAdapter();

    await storePartition(adapter, Item, '2025', [
      {
        id: 'Item.2025.xyz',
        title: 'Persisted',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        device: 'dev',
      },
    ]);

    const { repo } = setupRepo({ localAdapter: adapter });

    // Bug: without ensurePartitionLoaded, delete returns false
    const deleted = await repo.delete('Item.2025.xyz');
    expect(deleted).toBe(true);

    const entity = await repo.get('Item.2025.xyz');
    expect(entity).toBeUndefined();
  });
});

// ── #5: Cache miss must not block future loads ──────────────────────
describe('PR-review #5: cache miss does not permanently block partition', () => {
  it('data arriving after initial miss is visible on next read', async () => {
    const adapter = createMemoryBlobAdapter();

    // Start with empty adapter
    const { repo } = setupRepo({ localAdapter: adapter });

    // First read — cache miss (no data in adapter)
    const first = await repo.getAll({ partitionKey: '2025' });
    expect(first).toHaveLength(0);

    // Simulate data arriving via sync
    await storePartition(adapter, Item, '2025', [
      {
        id: 'Item.2025.late',
        title: 'Arrived late',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        device: 'sync',
      },
    ]);

    // Bug: with cached miss, second read would still return []
    const second = await repo.getAll({ partitionKey: '2025' });
    expect(second).toHaveLength(1);
    expect(second[0]!.title).toBe('Arrived late');
  });
});

// ── #6: Mutable blob read must not corrupt storage ──────────────────
describe('PR-review #6: blob adapter read returns defensive copy', () => {
  it('mutating a read result does not corrupt internal storage', async () => {
    const adapter = createMemoryBlobAdapter();
    const original = new TextEncoder().encode('hello');
    await adapter.write('key', original);

    // Read and mutate
    const result = await adapter.read('key');
    expect(result).not.toBeNull();
    result![0] = 88; // 'X'

    // Read again — should still be 'hello', not 'Xello'
    const second = await adapter.read('key');
    expect(new TextDecoder().decode(second!)).toBe('hello');
  });
});

// ── #7: Tenant Date rehydration after persistence ───────────────────
describe('PR-review #7: tenant dates are Date objects after round-trip', () => {
  it('createdAt and updatedAt are Date instances after create + list', async () => {
    const store = createEntityStore();
    const localAdapter = createMemoryBlobAdapter();
    const manager = createTenantManager({ store, localAdapter, deviceId: 'dev' });

    await manager.create({ name: 'Test Workspace' });

    // Create a second manager reading from the same adapter (simulating app restart)
    const manager2 = createTenantManager({ store: createEntityStore(), localAdapter, deviceId: 'dev' });
    const tenants = await manager2.list();

    expect(tenants).toHaveLength(1);
    // Bug: without rehydration these would be strings, not Dates
    expect(tenants[0]!.createdAt).toBeInstanceOf(Date);
    expect(tenants[0]!.updatedAt).toBeInstanceOf(Date);
    expect(tenants[0]!.createdAt.getTime()).toBeGreaterThan(0);
  });
});
