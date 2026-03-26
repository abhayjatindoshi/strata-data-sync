import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { defineEntity } from '@strata/schema';
import { createStore } from '@strata/store';
import { loadPartitionFromAdapter } from '@strata/store/flush';
import type { Hlc } from '@strata/hlc';

type ItemV1 = { name: string };
type ItemV2 = { name: string; displayName: string };
type ItemV3 = { name: string; displayName: string; priority: number };

describe('Schema migration integration', () => {
  it('migrates v1 entities to v2 on load', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    // Write v1 data directly with __v: 1 stamped
    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      item: {
        id1: { id: 'id1', name: 'alice', hlc, __v: 1 },
      },
      deleted: {},
    });

    // Define v2 entity with migration
    const defV2 = defineEntity<ItemV2>('item', {
      version: 2,
      migrations: {
        2: (e: unknown) => {
          const rec = e as Record<string, unknown>;
          return { ...rec, displayName: String(rec.name).toUpperCase() };
        },
      },
    });

    // Load with v2 definition — migration should apply
    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', defV2);
    expect(entities.size).toBe(1);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('alice');
    expect(entity.displayName).toBe('ALICE');
    // __v should be stripped
    expect(entity.__v).toBeUndefined();
  });

  it('applies sequential migrations v1→v2→v3', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    // Write v1 data directly with __v: 1 stamped
    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      item: {
        id1: { id: 'id1', name: 'bob', hlc, __v: 1 },
      },
      deleted: {},
    });

    // Define v3 entity with v1→v2 and v2→v3 migrations
    const defV3 = defineEntity<ItemV3>('item', {
      version: 3,
      migrations: {
        2: (e: unknown) => {
          const rec = e as Record<string, unknown>;
          return { ...rec, displayName: String(rec.name).toUpperCase() };
        },
        3: (e: unknown) => {
          const rec = e as Record<string, unknown>;
          return { ...rec, priority: 0 };
        },
      },
    });

    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', defV3);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('bob');
    expect(entity.displayName).toBe('BOB');
    expect(entity.priority).toBe(0);
    expect(entity.__v).toBeUndefined();
  });

  it('no-op when version matches', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    // Write v2 data directly with __v: 2 stamped
    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      item: {
        id1: { id: 'id1', name: 'charlie', displayName: 'CHARLIE', hlc, __v: 2 },
      },
      deleted: {},
    });

    const defV2 = defineEntity<ItemV2>('item', {
      version: 2,
      migrations: {
        2: (e: unknown) => {
          const rec = e as Record<string, unknown>;
          return { ...rec, displayName: String(rec.name).toUpperCase() };
        },
      },
    });

    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', defV2);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('charlie');
    expect(entity.displayName).toBe('CHARLIE');
    expect(entity.__v).toBeUndefined();
  });

  it('works without definition (backward compatible)', async () => {
    const adapter = createMemoryBlobAdapter();
    const store = createStore();

    // Write data directly without __v stamp
    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      item: {
        id1: { id: 'id1', name: 'dave', hlc },
      },
      deleted: {},
    });

    // Load without definition — no migration, no __v stripping (no __v was written)
    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global');
    expect(entities.size).toBe(1);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('dave');
  });

  it('stamps __v on write when entityVersion provided', async () => {
    const adapter = createMemoryBlobAdapter();

    // Write blob directly with __v stamped
    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      item: {
        id1: { id: 'id1', name: 'eve', hlc, __v: 3 },
      },
      deleted: {},
    });

    // Read raw blob to verify __v is stamped
    const blob = await adapter.read(undefined, 'item.global');
    const entities = blob!['item'] as Record<string, Record<string, unknown>>;
    expect(entities['id1'].__v).toBe(3);
  });
});
