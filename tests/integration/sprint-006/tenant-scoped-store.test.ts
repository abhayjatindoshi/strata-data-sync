import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { scopeStore } from '../../../src/tenant/index.js';
import type { StoreEntry } from '../../../src/store/index.js';

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

describe('Integration: Tenant-Scoped Store', () => {
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
