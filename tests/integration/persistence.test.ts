import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
  partitioned,
  serialize,
  deserialize,
  partitionHash,
} from '@strata/index';
import type { Strata } from '@strata/index';
import type { Repository } from '@strata/repo';
import type { Hlc } from '@strata/hlc';
import type { BaseEntity } from '@strata/schema';

type Transaction = { amount: number; date: Date; accountId: string };
type Item = { name: string; category: string };

const TransactionDef = defineEntity<Transaction>('transaction', {
  keyStrategy: partitioned((e: Transaction) => e.accountId),
});
const ItemDef = defineEntity<Item>('item');

describe('Persistence round-trip integration', () => {
  const instances: Strata[] = [];

  afterEach(async () => {
    for (const s of instances) {
      await s.dispose().catch(() => {});
    }
    instances.length = 0;
  });

  function track(s: Strata): Strata {
    instances.push(s);
    return s;
  }

  it('Date fields survive save → flush → reload cycle', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const strata1 = track(createStrata({
      entities: [TransactionDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta: { b: 1 } });
    await strata1.loadTenant(tenant.id);

    const repo1 = strata1.repo(TransactionDef) as Repository<Transaction>;
    const targetDate = new Date('2026-06-15T10:30:00.000Z');
    const id = repo1.save({ amount: 99.95, date: targetDate, accountId: 'checking' });

    await strata1.dispose();

    // Reload
    const strata2 = track(createStrata({
      entities: [TransactionDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);

    const repo2 = strata2.repo(TransactionDef) as Repository<Transaction>;
    const loaded = repo2.get(id);

    expect(loaded).toBeDefined();
    expect(loaded!.date).toBeInstanceOf(Date);
    expect(loaded!.date.toISOString()).toBe('2026-06-15T10:30:00.000Z');
    expect(loaded!.amount).toBe(99.95);

    // BaseEntity Date fields
    expect(loaded!.createdAt).toBeInstanceOf(Date);
    expect(loaded!.updatedAt).toBeInstanceOf(Date);
  });

  it('multiple partition keys → flush → each partition blob written separately', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const strata = track(createStrata({
      entities: [TransactionDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'W', meta: { b: 1 } });
    await strata.loadTenant(tenant.id);

    const repo = strata.repo(TransactionDef) as Repository<Transaction>;
    repo.save({ amount: 100, date: new Date(), accountId: 'checking' });
    repo.save({ amount: 200, date: new Date(), accountId: 'savings' });
    repo.save({ amount: 50, date: new Date(), accountId: 'checking' });

    await strata.dispose();

    // Verify separate partition blobs exist
    const checkingBlob = await localAdapter.read(tenant, 'transaction.checking');
    const savingsBlob = await localAdapter.read(tenant, 'transaction.savings');

    expect(checkingBlob).not.toBeNull();
    expect(savingsBlob).not.toBeNull();

    // Verify checking has 2 entities
    const checkingData = checkingBlob as Record<string, unknown>;
    const checkingEntities = checkingData['transaction'] as Record<string, unknown>;
    expect(Object.keys(checkingEntities)).toHaveLength(2);

    // Verify savings has 1 entity
    const savingsData = savingsBlob as Record<string, unknown>;
    const savingsEntities = savingsData['transaction'] as Record<string, unknown>;
    expect(Object.keys(savingsEntities)).toHaveLength(1);
  });

  it('partition hash is deterministic for same entities', () => {
    const hlcA: Hlc = { timestamp: 1000, counter: 0, nodeId: 'n1' };
    const hlcB: Hlc = { timestamp: 2000, counter: 1, nodeId: 'n2' };

    const map1 = new Map<string, Hlc>([
      ['entity-a', hlcA],
      ['entity-b', hlcB],
    ]);

    const map2 = new Map<string, Hlc>([
      ['entity-b', hlcB],
      ['entity-a', hlcA],
    ]);

    // Hash should be the same regardless of insertion order
    expect(partitionHash(map1)).toBe(partitionHash(map2));
  });

  it('partition hash differs when entity HLC changes', () => {
    const hlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'n1' };
    const hlcUpdated: Hlc = { timestamp: 1001, counter: 0, nodeId: 'n1' };

    const map1 = new Map<string, Hlc>([['entity-a', hlc]]);
    const map2 = new Map<string, Hlc>([['entity-a', hlcUpdated]]);

    expect(partitionHash(map1)).not.toBe(partitionHash(map2));
  });

  it('serialize → deserialize preserves type markers', () => {
    const data = {
      name: 'Test',
      date: new Date('2026-01-01T00:00:00.000Z'),
      nested: {
        ts: new Date('2026-06-15T12:00:00.000Z'),
      },
    };

    const bytes = serialize(data);
    const restored = deserialize<typeof data>(bytes);

    expect(restored.date).toBeInstanceOf(Date);
    expect(restored.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(restored.nested.ts).toBeInstanceOf(Date);
    expect(restored.nested.ts.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    expect(restored.name).toBe('Test');
  });

  it('entity version increments on re-save and persists', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const strata1 = track(createStrata({
      entities: [ItemDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta: { b: 1 } });
    await strata1.loadTenant(tenant.id);

    const repo1 = strata1.repo(ItemDef) as Repository<Item>;
    const id = repo1.save({ name: 'Widget', category: 'A' });
    expect(repo1.get(id)?.version).toBe(1);

    repo1.save({ name: 'Widget v2', category: 'A', id } as Item & { id: string });
    expect(repo1.get(id)?.version).toBe(2);

    repo1.save({ name: 'Widget v3', category: 'A', id } as Item & { id: string });
    expect(repo1.get(id)?.version).toBe(3);

    await strata1.dispose();

    const strata2 = track(createStrata({
      entities: [ItemDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.loadTenant(tenant.id);

    const repo2 = strata2.repo(ItemDef) as Repository<Item>;
    const loaded = repo2.get(id);
    expect(loaded?.version).toBe(3);
    expect(loaded?.name).toBe('Widget v3');
  });

  it('tombstones included in partition blob after delete', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const strata = track(createStrata({
      entities: [ItemDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'W', meta: { b: 1 } });
    await strata.loadTenant(tenant.id);

    const repo = strata.repo(ItemDef) as Repository<Item>;
    const id = repo.save({ name: 'To Delete', category: 'temp' });
    repo.delete(id);

    await strata.dispose();

    // Verify the partition blob contains tombstone
    const blob = await localAdapter.read(tenant, 'item._');
    expect(blob).not.toBeNull();

    const data = blob as Record<string, unknown>;
    const deleted = data['deleted'] as Record<string, unknown>;
    const itemTombstones = deleted?.['item'] as Record<string, unknown>;
    expect(itemTombstones).toBeDefined();
    expect(itemTombstones[id]).toBeDefined();
  });
});
