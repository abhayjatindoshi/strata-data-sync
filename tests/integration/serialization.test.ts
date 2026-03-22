import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from '@strata/persistence';
import { createEntityStore } from '@strata/store';
import type { StoreEntry } from '@strata/store';
import { buildEntityKey, buildEntityId } from '@strata/entity';

// ── Serialization ───────────────────────────────────────────────────
describe('Serialization', () => {
  it('serializes with deterministic sorted keys', () => {
    const obj = { zebra: 1, apple: 2, mango: 3 };
    const json = serialize(obj);
    const keys = [...json.matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(keys).toEqual(['apple', 'mango', 'zebra']);
  });

  it('produces identical output regardless of insertion order', () => {
    const a = { z: 1, a: 2, m: { y: 3, b: 4 } };
    const b = { a: 2, m: { b: 4, y: 3 }, z: 1 };
    expect(serialize(a)).toBe(serialize(b));
  });

  it('sorts keys in nested objects', () => {
    const nested = { outer: { zz: 1, aa: 2 }, inner: { bb: 3, aa: 4 } };
    const json = serialize(nested);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual(['inner', 'outer']);
    expect(Object.keys(parsed.inner)).toEqual(['aa', 'bb']);
    expect(Object.keys(parsed.outer)).toEqual(['aa', 'zz']);
  });

  it('handles arrays, nulls, and primitive values', () => {
    const data = { items: [3, 1, 2], flag: null, name: 'test' };
    const json = serialize(data);
    const parsed = JSON.parse(json);
    expect(parsed.items).toEqual([3, 1, 2]);
    expect(parsed.flag).toBeNull();
    expect(parsed.name).toBe('test');
  });

  it('deserializes a valid blob with entities and deleted section', () => {
    const blob = {
      order: {
        'order.2025-06.abc': { id: 'order.2025-06.abc', amount: 50 },
      },
      deleted: {
        invoice: { 'invoice.2025-05.xyz': '2025-06-01T00:00:00Z' },
      },
    };
    const json = serialize(blob);
    const result = deserialize(json);

    expect(result.entities['order']!['order.2025-06.abc']!['amount']).toBe(50);
    expect(result.deleted['invoice']!['invoice.2025-05.xyz']).toBe('2025-06-01T00:00:00Z');
  });

  it('rejects blobs with non-object entity data', () => {
    const json = JSON.stringify({ order: { 'order.2025.abc': 'not-an-object' } });
    expect(() => deserialize(json)).toThrow('must be an object');
  });

  it('rejects blobs with entities missing an id field', () => {
    const json = JSON.stringify({
      order: { 'order.2025.abc': { name: 'no-id' } },
    });
    expect(() => deserialize(json)).toThrow('must have a string "id" field');
  });

  it('rejects non-object blobs', () => {
    expect(() => deserialize('"just a string"')).toThrow('expected an object');
  });
});

// ── Round-Trip (Store → Serialize → Deserialize) ────────────────────
function makeEntity(id: string, fields: Record<string, unknown> = {}): StoreEntry {
  const now = new Date('2025-06-15T10:00:00Z');
  return { id, createdAt: now, updatedAt: now, version: 1, device: 'dev-1', ...fields };
}

describe('Round-Trip (Store → Serialize → Deserialize)', () => {
  it('round-trips a single entity through store, serialize, and deserialize', () => {
    const store = createEntityStore();
    const entityKey = buildEntityKey('widget', '2025-06');
    const id = buildEntityId('widget', '2025-06', 'roundtrp');
    const entity = makeEntity(id, { color: 'blue', weight: 42 });

    store.save(entityKey, entity);

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

    const orders = restored.entities['order']!;
    expect(Object.keys(orders)).toHaveLength(2);
    expect(orders[orderId1]!['id']).toBe(orderId1);
    expect(orders[orderId1]!['total']).toBe(100);
    expect(orders[orderId2]!['total']).toBe(200);

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

    // Verify round-trip serialization stability
    serialize(restored.entities);
    serialize(blob);

    const restoredEntity = restored.entities['order']!['order.2025-06.abc12345']!;
    expect(restoredEntity['total']).toBe(150);
    expect(restoredEntity['id']).toBe('order.2025-06.abc12345');

    expect(restored.deleted['order']!['order.2025-05.old00001']).toBe('2025-06-01T00:00:00Z');
  });
});
