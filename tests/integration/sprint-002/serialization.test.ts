import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from '../../../src/index.js';

describe('Sprint 002 Integration: Serialization', () => {
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
    expect(parsed.items).toEqual([3, 1, 2]); // arrays preserve order
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
