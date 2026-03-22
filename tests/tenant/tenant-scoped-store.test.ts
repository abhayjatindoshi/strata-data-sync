import { describe, it, expect } from 'vitest';
import { createEntityStore } from '@strata/store';
import { scopeStore } from '@strata/tenant/tenant-scoped-store';
import type { StoreEntry } from '@strata/store';

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

describe('scopeStore', () => {
  it('saves entities under tenant-scoped keys', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');
    const entry = makeEntry('Account.global.abc', { name: 'Checking' });

    scoped.save('Account.global', entry);

    expect(base.hasPartition('tenant:t1:Account.global')).toBe(true);
    expect(base.hasPartition('Account.global')).toBe(false);
  });

  it('retrieves entities through scoped store', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');
    const entry = makeEntry('Account.global.abc', { name: 'Checking' });

    scoped.save('Account.global', entry);
    const result = scoped.get('Account.global', 'Account.global.abc');

    expect(result).toEqual(entry);
  });

  it('getAll returns entities from scoped partition', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');

    scoped.save('Account.global', makeEntry('Account.global.a'));
    scoped.save('Account.global', makeEntry('Account.global.b'));

    const all = scoped.getAll('Account.global');
    expect(all).toHaveLength(2);
  });

  it('getById resolves through scoped key', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');
    const entry = makeEntry('Transaction.2025.xyz', { amount: 50 });

    scoped.save('Transaction.2025', entry);
    const result = scoped.getById('Transaction.2025.xyz');

    expect(result).toEqual(entry);
  });

  it('isolates data between tenants', () => {
    const base = createEntityStore();
    const t1 = scopeStore(base, 'tenant-1');
    const t2 = scopeStore(base, 'tenant-2');

    t1.save('Account.global', makeEntry('Account.global.a', { name: 'T1' }));
    t2.save('Account.global', makeEntry('Account.global.b', { name: 'T2' }));

    expect(t1.getAll('Account.global')).toHaveLength(1);
    expect(t2.getAll('Account.global')).toHaveLength(1);
    expect(t1.get('Account.global', 'Account.global.a')!['name']).toBe('T1');
    expect(t2.get('Account.global', 'Account.global.b')!['name']).toBe('T2');
  });

  it('listPartitions returns unscoped keys', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');

    scoped.createPartition('Transaction.2024');
    scoped.createPartition('Transaction.2025');

    const keys = scoped.listPartitions('Transaction');
    expect(keys).toHaveLength(2);
    expect(keys).toContain('Transaction.2024');
    expect(keys).toContain('Transaction.2025');
  });

  it('listPartitions does not leak other tenant partitions', () => {
    const base = createEntityStore();
    const t1 = scopeStore(base, 'tenant-1');
    const t2 = scopeStore(base, 'tenant-2');

    t1.createPartition('Account.global');
    t2.createPartition('Account.global');
    t2.createPartition('Account.archive');

    expect(t1.listPartitions('Account')).toHaveLength(1);
    expect(t2.listPartitions('Account')).toHaveLength(2);
  });

  it('hasPartition checks scoped key', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');

    scoped.createPartition('Account.global');
    expect(scoped.hasPartition('Account.global')).toBe(true);
    expect(scoped.hasPartition('Account.other')).toBe(false);
  });

  it('deletePartition removes scoped partition', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');

    scoped.createPartition('Account.global');
    expect(scoped.deletePartition('Account.global')).toBe(true);
    expect(scoped.hasPartition('Account.global')).toBe(false);
  });

  it('delete removes entity from scoped partition', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');
    const entry = makeEntry('Account.global.abc');

    scoped.save('Account.global', entry);
    expect(scoped.delete('Account.global', 'Account.global.abc')).toBe(true);
    expect(scoped.get('Account.global', 'Account.global.abc')).toBeUndefined();
  });

  it('unscoped store does not see scoped data', () => {
    const base = createEntityStore();
    const scoped = scopeStore(base, 't1');

    scoped.save('Account.global', makeEntry('Account.global.abc'));

    expect(base.getAll('Account.global')).toHaveLength(0);
    expect(base.listPartitions('Account')).toHaveLength(0);
  });
});
