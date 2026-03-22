import { describe, it, expect } from 'vitest';
import { defineEntity } from '@strata/schema';
import { dateKeyStrategy } from '@strata/key-strategy';
import { createMemoryBlobAdapter, serialize } from '@strata/persistence';
import { createStrata } from './create-strata';

const Account = defineEntity<{ name: string; balance: number }>('Account');
const Transaction = defineEntity<{ amount: number; date: Date; accountId: string }>('Transaction');

function makeConfig(overrides?: Record<string, unknown>) {
  return {
    entities: [Account, Transaction],
    localAdapter: createMemoryBlobAdapter(),
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'test-device',
    ...overrides,
  };
}

async function seedTenant(adapter: ReturnType<typeof createMemoryBlobAdapter>, tenantId: string) {
  const group: Record<string, Record<string, unknown>> = {};
  group[tenantId] = {
    id: tenantId,
    name: 'Test Tenant',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    device: 'test-device',
  };
  const json = serialize({ __tenants: group });
  const data = new TextEncoder().encode(json);
  await adapter.write('__tenants', data);
}

describe('createStrata', () => {
  describe('TASK-001: types and validation', () => {
    it('creates a Strata instance with valid config', () => {
      const strata = createStrata(makeConfig());
      expect(strata).toBeDefined();
      expect(strata.repo).toBeTypeOf('function');
      expect(strata.load).toBeTypeOf('function');
      expect(strata.sync).toBeTypeOf('function');
      expect(strata.dispose).toBeTypeOf('function');
      expect(strata.tenants).toBeDefined();
      strata.dispose();
    });

    it('throws on duplicate entity names', () => {
      const Dup = defineEntity<{ x: number }>('Account');
      expect(() =>
        createStrata(makeConfig({ entities: [Account, Dup] })),
      ).toThrow('Duplicate entity name: Account');
    });
  });

  describe('TASK-002: core wiring', () => {
    it('creates independent instances with separate state', async () => {
      const adapter1 = createMemoryBlobAdapter();
      const adapter2 = createMemoryBlobAdapter();
      await seedTenant(adapter1, 'tenant-1');
      await seedTenant(adapter2, 'tenant-2');

      const s1 = createStrata(makeConfig({ localAdapter: adapter1 }));
      const s2 = createStrata(makeConfig({ localAdapter: adapter2 }));

      await s1.load('tenant-1');
      await s2.load('tenant-2');

      const repo1 = s1.repo(Account);
      const repo2 = s2.repo(Account);
      expect(repo1).not.toBe(repo2);

      s1.dispose();
      s2.dispose();
    });
  });

  describe('TASK-003: repo() method', () => {
    it('returns a typed repository after loading a tenant', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      const repo = strata.repo(Account);
      expect(repo).toBeDefined();
      expect(repo.get).toBeTypeOf('function');
      expect(repo.getAll).toBeTypeOf('function');
      expect(repo.save).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
      expect(repo.observe).toBeTypeOf('function');
      expect(repo.observeAll).toBeTypeOf('function');

      strata.dispose();
    });

    it('caches repository instances by entity name', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      const repo1 = strata.repo(Account);
      const repo2 = strata.repo(Account);
      expect(repo1).toBe(repo2);

      strata.dispose();
    });

    it('returns different repositories for different entity defs', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      const acctRepo = strata.repo(Account);
      const txnRepo = strata.repo(Transaction);
      expect(acctRepo).not.toBe(txnRepo);

      strata.dispose();
    });

    it('throws when entity is not registered', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      const Unknown = defineEntity<{ x: number }>('Unknown');
      expect(() => strata.repo(Unknown)).toThrow('not registered');

      strata.dispose();
    });

    it('throws when no tenant is loaded', () => {
      const strata = createStrata(makeConfig());
      expect(() => strata.repo(Account)).toThrow('No tenant loaded');
      strata.dispose();
    });

    it('supports CRUD through the repository', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      const repo = strata.repo(Account);
      const id = await repo.save({ name: 'Checking', balance: 1000 });
      expect(id).toBeTypeOf('string');

      const acct = await repo.get(id);
      expect(acct).toBeDefined();
      expect(acct!.name).toBe('Checking');
      expect(acct!.balance).toBe(1000);

      strata.dispose();
    });
  });

  describe('TASK-004: load(tenantId)', () => {
    it('loads a tenant and scopes data', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      const repo = strata.repo(Account);
      await repo.save({ name: 'Savings', balance: 500 });

      const all = await repo.getAll();
      expect(all.length).toBe(1);

      strata.dispose();
    });

    it('throws when loading a non-existent tenant', async () => {
      const strata = createStrata(makeConfig());
      await expect(strata.load('nonexistent')).rejects.toThrow('Tenant not found');
      strata.dispose();
    });

    it('clears repo cache on tenant switch', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      // Also seed a second tenant
      const tenantListData = await adapter.read('__tenants');
      const tenantListJson = new TextDecoder().decode(tenantListData!);
      const blob = JSON.parse(tenantListJson);
      blob.__tenants['tenant-2'] = {
        id: 'tenant-2',
        name: 'Tenant 2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        device: 'test-device',
      };
      const updatedJson = serialize(blob);
      await adapter.write('__tenants', new TextEncoder().encode(updatedJson));

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');
      const repo1 = strata.repo(Account);

      await strata.load('tenant-2');
      const repo2 = strata.repo(Account);

      // Repos should be different instances after tenant switch
      expect(repo1).not.toBe(repo2);

      strata.dispose();
    });

    it('isolates data between tenants', async () => {
      const adapter = createMemoryBlobAdapter();
      // Seed two tenants
      const group: Record<string, Record<string, unknown>> = {
        'tenant-a': {
          id: 'tenant-a', name: 'A',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          version: 1, device: 'test-device',
        },
        'tenant-b': {
          id: 'tenant-b', name: 'B',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          version: 1, device: 'test-device',
        },
      };
      const json = serialize({ __tenants: group });
      await adapter.write('__tenants', new TextEncoder().encode(json));

      const strata = createStrata(makeConfig({ localAdapter: adapter }));

      // Save data in tenant-a
      await strata.load('tenant-a');
      const repoA = strata.repo(Account);
      await repoA.save({ name: 'Account A', balance: 100 });

      // Switch to tenant-b
      await strata.load('tenant-b');
      const repoB = strata.repo(Account);
      const allB = await repoB.getAll();
      expect(allB.length).toBe(0);

      strata.dispose();
    });
  });

  describe('TASK-005: sync scheduling', () => {
    it('exposes sync() which does not throw', async () => {
      const adapter = createMemoryBlobAdapter();
      await seedTenant(adapter, 'tenant-1');

      const strata = createStrata(makeConfig({ localAdapter: adapter }));
      await strata.load('tenant-1');

      expect(() => strata.sync()).not.toThrow();

      strata.dispose();
    });

    it('sync() throws after dispose', async () => {
      const strata = createStrata(makeConfig());
      strata.dispose();
      expect(() => strata.sync()).toThrow('disposed');
    });
  });

  describe('TASK-006: dispose()', () => {
    it('marks instance as disposed', () => {
      const strata = createStrata(makeConfig());
      strata.dispose();

      expect(() => strata.repo(Account)).toThrow('disposed');
      expect(() => strata.sync()).toThrow('disposed');
    });

    it('can be called multiple times safely', () => {
      const strata = createStrata(makeConfig());
      strata.dispose();
      expect(() => strata.dispose()).not.toThrow();
    });

    it('rejects load after dispose', async () => {
      const strata = createStrata(makeConfig());
      strata.dispose();
      await expect(strata.load('any')).rejects.toThrow('disposed');
    });
  });
});
