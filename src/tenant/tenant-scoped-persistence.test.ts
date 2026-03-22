import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/persistence';
import { loadPartition } from '@strata/persistence/load-partition';
import { storePartition } from '@strata/persistence/store-partition';
import { defineEntity } from '@strata/schema';
import { scopeEntityKey } from './tenant-keys';

const Account = defineEntity<{ name: string; balance: number }>('Account');

describe('tenant-scoped persistence', () => {
  describe('storePartition with tenantId', () => {
    it('stores data under tenant-scoped key', async () => {
      const adapter = createMemoryBlobAdapter();
      const entities = [
        { id: 'Account.2025.a1', name: 'Savings', balance: 100 },
      ];

      await storePartition(adapter, Account, '2025', entities, 'tenant-1');

      const scopedKey = scopeEntityKey('tenant-1', 'Account.2025');
      const data = await adapter.read(scopedKey);
      expect(data).not.toBeNull();

      // Original unscoped key should not exist
      const unscopedData = await adapter.read('Account.2025');
      expect(unscopedData).toBeNull();
    });
  });

  describe('loadPartition with tenantId', () => {
    it('loads data from tenant-scoped key', async () => {
      const adapter = createMemoryBlobAdapter();
      const entities = [
        { id: 'Account.2025.a1', name: 'Savings', balance: 100 },
      ];

      await storePartition(adapter, Account, '2025', entities, 'tenant-1');
      const loaded = await loadPartition(adapter, Account, '2025', 'tenant-1');

      expect(loaded).toHaveLength(1);
      expect(loaded[0]!['name']).toBe('Savings');
    });

    it('returns empty when loading wrong tenant', async () => {
      const adapter = createMemoryBlobAdapter();
      const entities = [
        { id: 'Account.2025.a1', name: 'Savings', balance: 100 },
      ];

      await storePartition(adapter, Account, '2025', entities, 'tenant-1');
      const loaded = await loadPartition(adapter, Account, '2025', 'tenant-2');

      expect(loaded).toHaveLength(0);
    });

    it('returns empty when no tenantId but data stored with tenantId', async () => {
      const adapter = createMemoryBlobAdapter();
      const entities = [
        { id: 'Account.2025.a1', name: 'Savings', balance: 100 },
      ];

      await storePartition(adapter, Account, '2025', entities, 'tenant-1');
      const loaded = await loadPartition(adapter, Account, '2025');

      expect(loaded).toHaveLength(0);
    });
  });

  describe('isolation between tenants', () => {
    it('different tenants have separate data', async () => {
      const adapter = createMemoryBlobAdapter();

      await storePartition(adapter, Account, '2025', [
        { id: 'Account.2025.a1', name: 'T1 Account', balance: 100 },
      ], 'tenant-1');

      await storePartition(adapter, Account, '2025', [
        { id: 'Account.2025.a2', name: 'T2 Account', balance: 200 },
      ], 'tenant-2');

      const t1Data = await loadPartition(adapter, Account, '2025', 'tenant-1');
      const t2Data = await loadPartition(adapter, Account, '2025', 'tenant-2');

      expect(t1Data).toHaveLength(1);
      expect(t1Data[0]!['name']).toBe('T1 Account');
      expect(t2Data).toHaveLength(1);
      expect(t2Data[0]!['name']).toBe('T2 Account');
    });
  });
});
