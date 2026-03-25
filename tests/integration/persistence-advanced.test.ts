import { describe, it, expect, afterEach } from 'vitest';
import {
  createStrata,
  defineEntity,
  createMemoryBlobAdapter,
  partitioned,
} from '@strata/index';
import type { Strata, BlobAdapter } from '@strata/index';
import type { Repository } from '@strata/repo';

type Item = { name: string; category: string };
type Transaction = { amount: number; date: Date; accountId: string };

const ItemDef = defineEntity<Item>('item');
const TransactionDef = defineEntity<Transaction>('transaction', {
  keyStrategy: partitioned((e: Transaction) => e.accountId),
});

describe('Persistence advanced integration', () => {
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

  it('transform pipeline end-to-end — custom adapter wrapping applied on flush and reversed on reload', async () => {
    const rawAdapter = createMemoryBlobAdapter();

    // Create a wrapping adapter that adds an envelope around stored data
    const transformedAdapter: BlobAdapter = {
      async read(cm, key) {
        const data = await rawAdapter.read(cm, key);
        if (!data) return null;
        const envelope = data as { __wrapped: unknown };
        return envelope.__wrapped;
      },
      async write(cm, key, data) {
        await rawAdapter.write(cm, key, { __wrapped: data });
      },
      async delete(cm, key) { return rawAdapter.delete(cm, key); },
      async list(cm, prefix) { return rawAdapter.list(cm, prefix); },
    };

    // Phase 1: Save through transformed adapter
    const strata1 = track(createStrata({
      entities: [ItemDef],
      localAdapter: transformedAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta: { b: 1 } });
    await strata1.tenants.load(tenant.id);

    const repo1 = strata1.repo(ItemDef) as Repository<Item>;
    const id = repo1.save({ name: 'Secret', category: 'classified' });
    await strata1.dispose();

    // Read raw blob — should be wrapped in envelope
    const rawBlob = await rawAdapter.read(tenant, 'item._') as Record<string, unknown>;
    expect(rawBlob).not.toBeNull();
    expect(rawBlob).toHaveProperty('__wrapped');

    // Phase 2: Reload through transformed adapter → data should be readable
    const strata2 = track(createStrata({
      entities: [ItemDef],
      localAdapter: transformedAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.tenants.load(tenant.id);

    const repo2 = strata2.repo(ItemDef) as Repository<Item>;
    const loaded = repo2.get(id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Secret');
    expect(loaded!.category).toBe('classified');
  });

  it('adapter list() discovers partition keys after flush', async () => {
    const localAdapter = createMemoryBlobAdapter();

    const strata = track(createStrata({
      entities: [TransactionDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'W', meta: { b: 1 } });
    await strata.tenants.load(tenant.id);

    const repo = strata.repo(TransactionDef) as Repository<Transaction>;
    repo.save({ amount: 100, date: new Date(), accountId: 'checking' });
    repo.save({ amount: 200, date: new Date(), accountId: 'savings' });
    repo.save({ amount: 50, date: new Date(), accountId: 'checking' });

    await strata.dispose();

    const keys = await localAdapter.list(tenant, 'transaction.');
    expect(keys.sort()).toEqual(['transaction.checking', 'transaction.savings']);
  });
});
