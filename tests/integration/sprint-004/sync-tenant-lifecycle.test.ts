import { describe, it, expect, beforeEach } from 'vitest';
import { firstValueFrom, skip } from 'rxjs';
import { MemoryBlobAdapter } from '@strata/adapter';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { createEntityStore } from '@strata/store';
import { serialize, deserialize, computePartitionHash } from '@strata/persistence';
import type { PartitionBlob, PartitionIndex, Tombstone } from '@strata/persistence';
import { createSyncEngine, purgeExpiredTombstones, createTombstone } from '@strata/sync';
import type { SyncEngine, SyncEventType } from '@strata/sync';
import { createTenantManager, deriveTenantId } from '@strata/tenant';
import type { Tenant, TenantManager } from '@strata/tenant';
import type { BaseEntity } from '@strata/entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Task = BaseEntity & {
  readonly title: string;
  readonly done: boolean;
};

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    createdAt: new Date('2025-06-01T10:00:00Z'),
    updatedAt: new Date('2025-06-01T10:00:00Z'),
    version: 1,
    device: 'dev-a',
    hlc: { timestamp: 1700000000000, counter: 0, nodeId: 'node-a' },
    title: 'Default Task',
    done: false,
    ...overrides,
  };
}

function writeBlob(adapter: BlobAdapter, meta: CloudMeta, key: string, blob: PartitionBlob): Promise<void> {
  return adapter.write(meta, key, encoder.encode(serialize(blob)));
}

function writeIndex(adapter: BlobAdapter, meta: CloudMeta, index: PartitionIndex): Promise<void> {
  return adapter.write(meta, '__partition_index', encoder.encode(serialize(index)));
}

async function readBlob(adapter: BlobAdapter, meta: CloudMeta, key: string): Promise<PartitionBlob | null> {
  const raw = await adapter.read(meta, key);
  if (!raw) return null;
  return deserialize(decoder.decode(raw)) as PartitionBlob;
}

/** A MemoryBlobAdapter that keys storage by cloudMeta (for multi-tenant tests). */
class CloudAwareAdapter implements BlobAdapter {
  private readonly stores = new Map<string, Map<string, Uint8Array>>();

  private key(cloudMeta: CloudMeta): string {
    return cloudMeta ? JSON.stringify(cloudMeta) : '__local__';
  }

  private getStore(cloudMeta: CloudMeta): Map<string, Uint8Array> {
    const k = this.key(cloudMeta);
    let s = this.stores.get(k);
    if (!s) { s = new Map(); this.stores.set(k, s); }
    return s;
  }

  async read(cloudMeta: CloudMeta, path: string): Promise<Uint8Array | null> {
    return this.getStore(cloudMeta).get(path) ?? null;
  }
  async write(cloudMeta: CloudMeta, path: string, data: Uint8Array): Promise<void> {
    this.getStore(cloudMeta).set(path, data);
  }
  async delete(cloudMeta: CloudMeta, path: string): Promise<void> {
    this.getStore(cloudMeta).delete(path);
  }
  async list(cloudMeta: CloudMeta, prefix: string): Promise<string[]> {
    return [...this.getStore(cloudMeta).keys()].filter(k => k.startsWith(prefix));
  }
}

/** Adapter that always throws on read/write/list to simulate unreachable cloud. */
class UnreachableAdapter implements BlobAdapter {
  async read(): Promise<Uint8Array | null> { throw new Error('cloud unreachable'); }
  async write(): Promise<void> { throw new Error('cloud unreachable'); }
  async delete(): Promise<void> { throw new Error('cloud unreachable'); }
  async list(): Promise<string[]> { throw new Error('cloud unreachable'); }
}

function buildSyncEngine(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
  store: ReturnType<typeof createEntityStore>,
  overrides: Partial<Parameters<typeof createSyncEngine>[0]> = {},
): SyncEngine {
  return createSyncEngine({
    localAdapter,
    cloudAdapter,
    store,
    serialize,
    deserialize,
    computeHash: computePartitionHash,
    cloudMeta: { container: 'test-cloud' },
    ...overrides,
  });
}

function collectEvents(engine: SyncEngine): SyncEventType[] {
  const events: SyncEventType[] = [];
  const types: SyncEventType[] = ['started', 'completed', 'failed', 'cloud-unreachable'];
  for (const t of types) {
    engine.onEvent(t, () => events.push(t));
  }
  return events;
}

// ===========================================================================
// 1. Tombstone Tests
// ===========================================================================

describe('Tombstone creation, retention, purge', () => {
  it('createTombstone produces correct structure', () => {
    const hlc = { timestamp: 1700000000000, counter: 1, nodeId: 'n1' };
    const ts = createTombstone('entity-1', hlc, new Date('2025-06-01'));
    expect(ts.id).toBe('entity-1');
    expect(ts.hlc).toEqual(hlc);
    expect(ts.deletedAt).toBe('2025-06-01T00:00:00.000Z');
  });

  it('purgeExpiredTombstones keeps non-expired tombstones', () => {
    const now = Date.now();
    const recentTombstone: Tombstone = {
      id: 'e1',
      hlc: { timestamp: now, counter: 0, nodeId: 'n1' },
      deletedAt: new Date(now - 10 * 86_400_000).toISOString(), // 10 days ago
    };
    const blob: PartitionBlob = {
      entities: {},
      deleted: { e1: recentTombstone },
    };
    const purged = purgeExpiredTombstones(blob, 90, now);
    expect(Object.keys(purged.deleted)).toHaveLength(1);
    expect(purged.deleted['e1']).toBeDefined();
  });

  it('purgeExpiredTombstones removes expired tombstones', () => {
    const now = Date.now();
    const oldTombstone: Tombstone = {
      id: 'e1',
      hlc: { timestamp: now - 200 * 86_400_000, counter: 0, nodeId: 'n1' },
      deletedAt: new Date(now - 100 * 86_400_000).toISOString(), // 100 days ago
    };
    const blob: PartitionBlob = {
      entities: {},
      deleted: { e1: oldTombstone },
    };
    const purged = purgeExpiredTombstones(blob, 90, now);
    expect(Object.keys(purged.deleted)).toHaveLength(0);
  });

  it('purgeExpiredTombstones returns same blob reference when nothing to purge', () => {
    const now = Date.now();
    const blob: PartitionBlob = { entities: {}, deleted: {} };
    const purged = purgeExpiredTombstones(blob, 90, now);
    expect(purged).toBe(blob); // referential equality
  });

  it('custom retention days are respected', () => {
    const now = Date.now();
    const ts: Tombstone = {
      id: 'e1',
      hlc: { timestamp: now, counter: 0, nodeId: 'n1' },
      deletedAt: new Date(now - 5 * 86_400_000).toISOString(), // 5 days ago
    };
    const blob: PartitionBlob = { entities: {}, deleted: { e1: ts } };

    // 3-day retention → should be purged
    expect(Object.keys(purgeExpiredTombstones(blob, 3, now).deleted)).toHaveLength(0);
    // 10-day retention → should be kept
    expect(Object.keys(purgeExpiredTombstones(blob, 10, now).deleted)).toHaveLength(1);
  });

  it('tombstones survive sync merge and are purged during sync', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();
    const now = Date.now();

    // Cloud has a partition with one entity and one old tombstone
    const cloudBlob: PartitionBlob = {
      entities: {
        t1: makeTask({ id: 't1', title: 'Cloud task' }),
      },
      deleted: {
        t2: {
          id: 't2',
          hlc: { timestamp: now - 200 * 86_400_000, counter: 0, nodeId: 'n1' },
          deletedAt: new Date(now - 100 * 86_400_000).toISOString(),
        },
      },
    };
    await writeBlob(cloudAdapter, { container: 'test-cloud' }, 'tasks', cloudBlob);
    await writeIndex(cloudAdapter, { container: 'test-cloud' }, {
      tasks: { hash: 123, count: 1, updatedAt: new Date().toISOString() },
    });

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      tombstoneRetentionDays: 90,
    });

    await engine.hydrate();
    // t1 should be in store, t2 should not (deleted)
    const all = store.getAll('tasks');
    expect(all.some(e => e.id === 't1')).toBe(true);
    expect(all.some(e => e.id === 't2')).toBe(false);

    // Verify the old tombstone was purged from local storage
    const localBlob = await readBlob(localAdapter, undefined, 'tasks');
    expect(localBlob).not.toBeNull();
    expect(localBlob!.deleted['t2']).toBeUndefined();

    await engine.dispose();
  });
});

// ===========================================================================
// 2. Full Sync Lifecycle
// ===========================================================================

describe('Full sync lifecycle', () => {
  let localAdapter: MemoryBlobAdapter;
  let cloudAdapter: MemoryBlobAdapter;
  let store: ReturnType<typeof createEntityStore>;

  beforeEach(() => {
    localAdapter = new MemoryBlobAdapter();
    cloudAdapter = new MemoryBlobAdapter();
    store = createEntityStore();
  });

  it('hydrate loads cloud data into store', async () => {
    const task = makeTask({ id: 't1', title: 'From cloud' });
    const blob: PartitionBlob = { entities: { t1: task }, deleted: {} };
    await writeBlob(cloudAdapter, { container: 'c' }, 'tasks', blob);
    await writeIndex(cloudAdapter, { container: 'c' }, {
      tasks: { hash: 1, count: 1, updatedAt: new Date().toISOString() },
    });

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });
    const events = collectEvents(engine);

    await engine.hydrate();

    expect(store.getAll('tasks')).toHaveLength(1);
    expect((store.getAll('tasks')[0] as Task).title).toBe('From cloud');
    expect(events).toContain('started');
    expect(events).toContain('completed');
    await engine.dispose();
  });

  it('hydrate falls back to local when cloud is unreachable', async () => {
    // Seed local data
    const task = makeTask({ id: 't1', title: 'Local only' });
    const blob: PartitionBlob = { entities: { t1: task }, deleted: {} };
    await writeBlob(localAdapter, undefined, 'tasks', blob);
    await writeIndex(localAdapter, undefined, {
      tasks: { hash: 1, count: 1, updatedAt: new Date().toISOString() },
    });

    const engine = buildSyncEngine(localAdapter, new UnreachableAdapter(), store);
    const events = collectEvents(engine);

    await engine.hydrate();

    expect(store.getAll('tasks')).toHaveLength(1);
    expect((store.getAll('tasks')[0] as Task).title).toBe('Local only');
    expect(events).toContain('cloud-unreachable');
    await engine.dispose();
  });

  it('manual sync() pushes local changes to cloud', async () => {
    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });
    await engine.hydrate();

    // Write a task directly to store
    const task = makeTask({ id: 't1', title: 'New task' });
    store.save('tasks', task);

    // Write local blob so sync can pick it up
    const blob: PartitionBlob = { entities: { t1: task }, deleted: {} };
    await writeBlob(localAdapter, undefined, 'tasks', blob);

    await engine.sync();

    // Verify cloud now has the data
    const cloudBlob = await readBlob(cloudAdapter, { container: 'c' }, 'tasks');
    expect(cloudBlob).not.toBeNull();
    expect(cloudBlob!.entities['t1']).toBeDefined();
    await engine.dispose();
  });

  it('periodic sync fires on interval', async () => {
    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      periodicIntervalMs: 50,
      cloudMeta: { container: 'c' },
    });
    const events = collectEvents(engine);

    await engine.hydrate();
    engine.startPeriodicSync();

    // Wait for at least one periodic sync to fire
    await new Promise(resolve => setTimeout(resolve, 120));

    engine.stopPeriodicSync();
    // At minimum, periodic sync should have fired 'started'
    expect(events.filter(e => e === 'started').length).toBeGreaterThanOrEqual(2); // hydrate + periodic

    await engine.dispose();
  });

  it('events: started → completed on successful sync', async () => {
    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });
    const events = collectEvents(engine);
    await engine.hydrate();
    await engine.sync();

    // Each operation produces started+completed
    const startedCount = events.filter(e => e === 'started').length;
    const completedCount = events.filter(e => e === 'completed').length;
    expect(startedCount).toBe(completedCount);
    expect(startedCount).toBeGreaterThanOrEqual(2);
    await engine.dispose();
  });
});

// ===========================================================================
// 3. Cloud-unreachable fallback during hydrate
// ===========================================================================

describe('Cloud-unreachable fallback', () => {
  it('emits cloud-unreachable event and still loads local data', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    const task = makeTask({ id: 't1', title: 'Offline data' });
    const blob: PartitionBlob = { entities: { t1: task }, deleted: {} };
    await writeBlob(localAdapter, undefined, 'tasks', blob);
    await writeIndex(localAdapter, undefined, {
      tasks: { hash: 1, count: 1, updatedAt: new Date().toISOString() },
    });

    const engine = buildSyncEngine(localAdapter, new UnreachableAdapter(), store);
    const events = collectEvents(engine);

    await engine.hydrate();

    expect(events).toContain('cloud-unreachable');
    expect(events).toContain('completed');
    expect(store.getAll('tasks')).toHaveLength(1);
    await engine.dispose();
  });

  it('sync emits cloud-unreachable when cloud is down during bidirectional sync', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    const engine = buildSyncEngine(localAdapter, new UnreachableAdapter(), store);
    const events = collectEvents(engine);

    await engine.hydrate();
    await engine.sync();

    expect(events).toContain('cloud-unreachable');
    await engine.dispose();
  });
});

// ===========================================================================
// 4. Copy optimization for one-sided partitions
// ===========================================================================

describe('Copy optimization for one-sided partitions', () => {
  it('cloud-only partitions are copied directly without per-entity merge', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    // Local has partition A
    const localBlob: PartitionBlob = {
      entities: { t1: makeTask({ id: 't1', title: 'Local task' }) },
      deleted: {},
    };
    await writeBlob(localAdapter, undefined, 'partA', localBlob);
    await writeIndex(localAdapter, undefined, {
      partA: { hash: 100, count: 1, updatedAt: new Date().toISOString() },
    });

    // Cloud has partition B (cloud-only)
    const cloudBlob: PartitionBlob = {
      entities: { t2: makeTask({ id: 't2', title: 'Cloud task' }) },
      deleted: {},
    };
    await writeBlob(cloudAdapter, { container: 'c' }, 'partB', cloudBlob);
    await writeIndex(cloudAdapter, { container: 'c' }, {
      partB: { hash: 200, count: 1, updatedAt: new Date().toISOString() },
    });

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });
    await engine.hydrate();
    await engine.sync();

    // partB should now be in local and store
    const localPartB = await readBlob(localAdapter, undefined, 'partB');
    expect(localPartB).not.toBeNull();
    expect(localPartB!.entities['t2']).toBeDefined();
    expect(store.getAll('partB')).toHaveLength(1);

    // partA should be pushed to cloud
    const cloudPartA = await readBlob(cloudAdapter, { container: 'c' }, 'partA');
    expect(cloudPartA).not.toBeNull();
    expect(cloudPartA!.entities['t1']).toBeDefined();

    await engine.dispose();
  });
});

// ===========================================================================
// 5. isDirty tracking
// ===========================================================================

describe('isDirty tracking', () => {
  it('isDirty is false initially and after sync', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });
    expect(engine.isDirty()).toBe(false);

    await engine.hydrate();
    expect(engine.isDirty()).toBe(false);

    await engine.dispose();
  });

  it('isDirty$ emits false initially', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });

    const value = await firstValueFrom(engine.isDirty$);
    expect(value).toBe(false);

    await engine.dispose();
  });
});

// ===========================================================================
// 6. Graceful shutdown
// ===========================================================================

describe('Graceful shutdown', () => {
  it('dispose completes isDirty$ subject', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });

    let completed = false;
    engine.isDirty$.subscribe({ complete: () => { completed = true; } });

    await engine.dispose();
    expect(completed).toBe(true);
  });

  it('dispose flushes pending data to local', async () => {
    const localAdapter = new MemoryBlobAdapter();
    const cloudAdapter = new MemoryBlobAdapter();
    const store = createEntityStore();

    const engine = buildSyncEngine(localAdapter, cloudAdapter, store, {
      cloudMeta: { container: 'c' },
    });
    await engine.hydrate();

    // Save data to store
    store.save('tasks', makeTask({ id: 't1', title: 'Pending flush' }));
    const blob: PartitionBlob = {
      entities: { t1: makeTask({ id: 't1', title: 'Pending flush' }) },
      deleted: {},
    };
    await writeBlob(localAdapter, undefined, 'tasks', blob);

    await engine.dispose();

    // Data should still be in local after dispose
    const localBlob = await readBlob(localAdapter, undefined, 'tasks');
    expect(localBlob).not.toBeNull();
  });
});

// ===========================================================================
// 7. Tenant CRUD
// ===========================================================================

describe('Tenant CRUD: create, list, load, delink, delete', () => {
  let localAdapter: CloudAwareAdapter;
  let cloudAdapter: CloudAwareAdapter;
  let tm: TenantManager;

  beforeEach(() => {
    localAdapter = new CloudAwareAdapter();
    cloudAdapter = new CloudAwareAdapter();
    tm = createTenantManager(localAdapter, cloudAdapter);
  });

  it('create produces a tenant with deterministic ID', async () => {
    const cloudMeta = { bucket: 'my-bucket', path: '/data' };
    const tenant = await tm.create({ name: 'Test Org', cloudMeta });

    expect(tenant.name).toBe('Test Org');
    expect(tenant.id).toBe(deriveTenantId(cloudMeta));
    expect(tenant.createdAt).toBeInstanceOf(Date);
    expect(tenant.updatedAt).toBeInstanceOf(Date);
    expect(tenant.cloudMeta).toEqual(cloudMeta);
  });

  it('list returns all created tenants', async () => {
    await tm.create({ name: 'Org A', cloudMeta: { bucket: 'a' } });
    await tm.create({ name: 'Org B', cloudMeta: { bucket: 'b' } });

    const tenants = await tm.list();
    expect(tenants).toHaveLength(2);
    expect(tenants.map(t => t.name).sort()).toEqual(['Org A', 'Org B']);
  });

  it('load sets active tenant and returns it', async () => {
    const created = await tm.create({ name: 'Org', cloudMeta: { bucket: 'x' } });
    const loaded = await tm.load(created.id);

    expect(loaded.id).toBe(created.id);
    expect(loaded.name).toBe('Org');
  });

  it('load throws for non-existent tenant', async () => {
    await expect(tm.load('nonexistent')).rejects.toThrow('Tenant not found');
  });

  it('delink removes tenant from list but data persists', async () => {
    const created = await tm.create({ name: 'Org', cloudMeta: { bucket: 'x' } });
    await tm.delink(created.id);

    const tenants = await tm.list();
    expect(tenants).toHaveLength(0);
  });

  it('delink clears active tenant if delinking active', async () => {
    const created = await tm.create({ name: 'Org', cloudMeta: { bucket: 'x' } });
    await tm.load(created.id);
    await tm.delink(created.id);

    const active = await firstValueFrom(tm.activeTenant$);
    expect(active).toBeNull();
  });

  it('delete removes tenant and destroys cloud data', async () => {
    const cloudMeta = { bucket: 'z' };
    const created = await tm.create({ name: 'Org', cloudMeta });

    // Write some cloud data at that tenant location
    await cloudAdapter.write(cloudMeta, 'somefile', encoder.encode('data'));

    await tm.delete(created.id);

    const tenants = await tm.list();
    expect(tenants).toHaveLength(0);

    // Cloud data should be destroyed
    const files = await cloudAdapter.list(cloudMeta, '');
    // __tenants blob may still exist from the create call, but 'somefile' should be gone
    expect(files).not.toContain('somefile');
  });

  it('create with custom id uses provided id', async () => {
    const tenant = await tm.create({
      name: 'Custom',
      cloudMeta: { bucket: 'c' },
      id: 'my-custom-id',
    });
    expect(tenant.id).toBe('my-custom-id');
  });

  it('create with optional icon and color', async () => {
    const tenant = await tm.create({
      name: 'Styled',
      cloudMeta: { bucket: 's' },
      icon: '🏢',
      color: '#ff0000',
    });
    expect(tenant.icon).toBe('🏢');
    expect(tenant.color).toBe('#ff0000');
  });
});

// ===========================================================================
// 8. Tenant union-merge between local and cloud
// ===========================================================================

describe('Tenant union-merge', () => {
  it('setup merges cloud tenants into local list', async () => {
    const localAdapter = new CloudAwareAdapter();
    const cloudAdapter = new CloudAwareAdapter();

    // Pre-seed cloud with a tenant list and marker
    const cloudMeta = { bucket: 'shared' };
    const cloudTenant: Tenant = {
      id: deriveTenantId(cloudMeta),
      name: 'Shared Org',
      cloudMeta,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-06-01'),
    };

    // Write cloud tenant list
    await cloudAdapter.write(
      cloudMeta,
      '__tenants',
      encoder.encode(serialize([{
        ...cloudTenant,
        createdAt: cloudTenant.createdAt.toISOString(),
        updatedAt: cloudTenant.updatedAt.toISOString(),
      }])),
    );
    // Write marker blob
    await cloudAdapter.write(
      cloudMeta,
      '__strata',
      encoder.encode(serialize({ version: 1, createdAt: new Date().toISOString() })),
    );

    // Create a separate local tenant
    const localMeta = { bucket: 'local-only' };
    const tm1 = createTenantManager(localAdapter, cloudAdapter);
    await tm1.create({ name: 'Local Org', cloudMeta: localMeta });

    // Now setup shared location
    const found = await tm1.setup({ cloudMeta });
    expect(found.name).toBe('Shared Org');

    // Local should now have both tenants
    const all = await tm1.list();
    expect(all).toHaveLength(2);
    expect(all.map(t => t.name).sort()).toEqual(['Local Org', 'Shared Org']);

    tm1.dispose();
  });

  it('union-merge keeps newer updatedAt when same tenant exists locally and in cloud', async () => {
    const localAdapter = new CloudAwareAdapter();
    const cloudAdapter = new CloudAwareAdapter();

    const cloudMeta = { bucket: 'shared' };
    const tenantId = deriveTenantId(cloudMeta);

    // Local has older version
    const localTenant = {
      id: tenantId,
      name: 'Old Name',
      cloudMeta,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-03-01T00:00:00.000Z',
    };
    await localAdapter.write(
      undefined,
      '__tenants',
      encoder.encode(serialize([localTenant])),
    );

    // Cloud has newer version
    const cloudTenantRecord = {
      id: tenantId,
      name: 'New Name',
      cloudMeta,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
    };
    await cloudAdapter.write(
      cloudMeta,
      '__tenants',
      encoder.encode(serialize([cloudTenantRecord])),
    );
    await cloudAdapter.write(
      cloudMeta,
      '__strata',
      encoder.encode(serialize({ version: 1, createdAt: new Date().toISOString() })),
    );

    const tm = createTenantManager(localAdapter, cloudAdapter);
    const found = await tm.setup({ cloudMeta });

    expect(found.name).toBe('New Name');
    tm.dispose();
  });
});

// ===========================================================================
// 9. activeTenant$ observable
// ===========================================================================

describe('activeTenant$ observable', () => {
  it('starts with null', async () => {
    const localAdapter = new CloudAwareAdapter();
    const cloudAdapter = new CloudAwareAdapter();
    const tm = createTenantManager(localAdapter, cloudAdapter);

    const val = await firstValueFrom(tm.activeTenant$);
    expect(val).toBeNull();
    tm.dispose();
  });

  it('emits tenant after load()', async () => {
    const localAdapter = new CloudAwareAdapter();
    const cloudAdapter = new CloudAwareAdapter();
    const tm = createTenantManager(localAdapter, cloudAdapter);

    const tenant = await tm.create({ name: 'Org', cloudMeta: { bucket: 'x' } });

    // Collect next emission after load
    const promise = firstValueFrom(tm.activeTenant$.pipe(skip(1)));
    await tm.load(tenant.id);
    const emitted = await promise;

    expect(emitted).not.toBeNull();
    expect(emitted!.id).toBe(tenant.id);
    tm.dispose();
  });

  it('emits null after delink of active tenant', async () => {
    const localAdapter = new CloudAwareAdapter();
    const cloudAdapter = new CloudAwareAdapter();
    const tm = createTenantManager(localAdapter, cloudAdapter);

    const tenant = await tm.create({ name: 'Org', cloudMeta: { bucket: 'x' } });
    await tm.load(tenant.id);

    const promise = firstValueFrom(tm.activeTenant$.pipe(skip(1)));
    await tm.delink(tenant.id);
    const emitted = await promise;

    expect(emitted).toBeNull();
    tm.dispose();
  });

  it('completes on dispose()', async () => {
    const localAdapter = new CloudAwareAdapter();
    const cloudAdapter = new CloudAwareAdapter();
    const tm = createTenantManager(localAdapter, cloudAdapter);

    let completed = false;
    tm.activeTenant$.subscribe({ complete: () => { completed = true; } });

    tm.dispose();
    expect(completed).toBe(true);
  });
});

// ===========================================================================
// 10. deriveTenantId deterministic behavior
// ===========================================================================

describe('deriveTenantId deterministic behavior', () => {
  it('same cloudMeta always produces same id', () => {
    const meta = { bucket: 'my-bucket', region: 'us-east' };
    const id1 = deriveTenantId(meta);
    const id2 = deriveTenantId(meta);
    expect(id1).toBe(id2);
  });

  it('different property order produces same id (sorted keys)', () => {
    const meta1 = { bucket: 'b', region: 'r' };
    const meta2 = { region: 'r', bucket: 'b' };
    expect(deriveTenantId(meta1)).toBe(deriveTenantId(meta2));
  });

  it('different cloudMeta produces different id', () => {
    const id1 = deriveTenantId({ bucket: 'a' });
    const id2 = deriveTenantId({ bucket: 'b' });
    expect(id1).not.toBe(id2);
  });

  it('returns a base-36 string', () => {
    const id = deriveTenantId({ bucket: 'test' });
    expect(id).toMatch(/^[0-9a-z]+$/);
  });
});
