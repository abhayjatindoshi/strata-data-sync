import { describe, it, expect } from 'vitest';
import {
  createEntityStore,
  serialize,
  deserialize,
  buildEntityKey,
  buildEntityId,
} from '../../../src/index.js';
import type { StoreEntry, PartitionBlob } from '../../../src/index.js';

function makeEntity(id: string, fields: Record<string, unknown> = {}): StoreEntry {
  const now = new Date('2025-06-15T10:00:00Z');
  return { id, createdAt: now, updatedAt: now, version: 1, device: 'dev-1', ...fields };
}

describe('Sprint 002 Integration: Round-Trip (Store → Serialize → Deserialize)', () => {
  it('round-trips a single entity through store, serialize, and deserialize', () => {
    const store = createEntityStore();
    const entityKey = buildEntityKey('widget', '2025-06');
    const id = buildEntityId('widget', '2025-06', 'roundtrp');
    const entity = makeEntity(id, { color: 'blue', weight: 42 });

    store.save(entityKey, entity);

    // Build a blob structure from the store (entity names at top level)
    const allEntities = store.getAll(entityKey);
    const blob: Record<string, Record<string, Record<string, unknown>>> = {
      widget: {},
    };
    for (const e of allEntities) {
      blob['widget']![e.id] = {
        ...e,
        createdAt: (e.createdAt as Date).toISOString(),
        updatedAt: (e.updatedAt as Date).toISOString(),
      };
    }

    const json = serialize(blob);
    const restored = deserialize(json);

    const restoredEntity = restored.entities['widget']![id]!;
    expect(restoredEntity['id']).toBe(id);
    expect(restoredEntity['color']).toBe('blue');
    expect(restoredEntity['weight']).toBe(42);
  });

  it('round-trips multiple entities across entity types', () => {
    const store = createEntityStore();

    const orderKey = buildEntityKey('order', '2025-03');
    const orderId1 = buildEntityId('order', '2025-03', 'ord001aa');
    const orderId2 = buildEntityId('order', '2025-03', 'ord002bb');

    const itemKey = buildEntityKey('item', '2025-03');
    const itemId = buildEntityId('item', '2025-03', 'itm001cc');

    store.save(orderKey, makeEntity(orderId1, { total: 100 }));
    store.save(orderKey, makeEntity(orderId2, { total: 200 }));
    store.save(itemKey, makeEntity(itemId, { name: 'Widget', qty: 5 }));

    // Build blob keyed by entity name
    const blob: Record<string, Record<string, Record<string, unknown>>> = {};

    for (const [key, entityName] of [[orderKey, 'order'], [itemKey, 'item']] as const) {
      blob[entityName] = {};
      for (const e of store.getAll(key)) {
        blob[entityName]![e.id] = {
          ...e,
          createdAt: (e.createdAt as Date).toISOString(),
          updatedAt: (e.updatedAt as Date).toISOString(),
        };
      }
    }

    const json = serialize(blob);
    const restored = deserialize(json);

    // Verify orders
    const orders = restored.entities['order']!;
    expect(Object.keys(orders)).toHaveLength(2);
    expect(orders[orderId1]!['id']).toBe(orderId1);
    expect(orders[orderId1]!['total']).toBe(100);
    expect(orders[orderId2]!['total']).toBe(200);

    // Verify items
    const items = restored.entities['item']!;
    expect(Object.keys(items)).toHaveLength(1);
    expect(items[itemId]!['name']).toBe('Widget');
    expect(items[itemId]!['qty']).toBe(5);
  });

  it('serialization is deterministic — same store data always produces the same JSON', () => {
    const store = createEntityStore();
    const key = buildEntityKey('product', '2025-01');

    const id1 = buildEntityId('product', '2025-01', 'prd001aa');
    const id2 = buildEntityId('product', '2025-01', 'prd002bb');

    store.save(key, makeEntity(id1, { sku: 'A100', price: 9.99 }));
    store.save(key, makeEntity(id2, { sku: 'B200', price: 19.99 }));

    function buildBlob(): Record<string, unknown> {
      const entries: Record<string, Record<string, unknown>> = {};
      for (const e of store.getAll(key)) {
        entries[e.id] = {
          ...e,
          createdAt: (e.createdAt as Date).toISOString(),
          updatedAt: (e.updatedAt as Date).toISOString(),
        };
      }
      return { product: entries };
    }

    const json1 = serialize(buildBlob());
    const json2 = serialize(buildBlob());
    expect(json1).toBe(json2);
  });

  it('deserialized blob preserves deleted section through round-trip', () => {
    const blob = {
      order: {
        'order.2025-06.abc12345': {
          id: 'order.2025-06.abc12345',
          total: 150,
          createdAt: '2025-06-15T10:00:00Z',
          updatedAt: '2025-06-15T10:00:00Z',
          version: 1,
          device: 'dev-1',
        },
      },
      deleted: {
        order: { 'order.2025-05.old00001': '2025-06-01T00:00:00Z' },
      },
    };

    const json = serialize(blob);
    const restored = deserialize(json);

    // Re-serialize and compare
    const json2 = serialize(restored.entities);
    const json3 = serialize(blob);

    // Entities section should match (deleted stripped in entities-only blob)
    const restoredEntity = restored.entities['order']!['order.2025-06.abc12345']!;
    expect(restoredEntity['total']).toBe(150);
    expect(restoredEntity['id']).toBe('order.2025-06.abc12345');

    // Deleted section preserved
    expect(restored.deleted['order']!['order.2025-05.old00001']).toBe('2025-06-01T00:00:00Z');
  });
});
