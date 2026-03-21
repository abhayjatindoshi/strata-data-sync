import { describe, it, expect } from 'vitest';
import { serialize } from './serialize.js';

describe('serialize', () => {
  it('sorts top-level keys alphabetically', () => {
    const result = serialize({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested object keys', () => {
    const result = serialize({ b: { z: 1, a: 2 }, a: 1 });
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('handles arrays without reordering elements', () => {
    const result = serialize({ items: [3, 1, 2] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('sorts keys inside array objects', () => {
    const result = serialize([{ b: 2, a: 1 }]);
    expect(result).toBe('[{"a":1,"b":2}]');
  });

  it('converts Date to ISO string', () => {
    const date = new Date('2025-06-15T10:30:00.000Z');
    const result = serialize({ date });
    expect(result).toBe('{"date":"2025-06-15T10:30:00.000Z"}');
  });

  it('handles null', () => {
    expect(serialize(null)).toBe('null');
  });

  it('handles undefined values in objects', () => {
    const result = serialize({ a: 1, b: undefined });
    expect(result).toBe('{"a":1}');
  });

  it('handles primitives', () => {
    expect(serialize(42)).toBe('42');
    expect(serialize('hello')).toBe('"hello"');
    expect(serialize(true)).toBe('true');
  });

  it('produces deterministic output for same data in different key order', () => {
    const a = serialize({ name: 'Checking', id: 'acct1', balance: 100 });
    const b = serialize({ balance: 100, id: 'acct1', name: 'Checking' });
    expect(a).toBe(b);
  });

  it('handles deeply nested objects', () => {
    const result = serialize({ c: { b: { a: 1 } } });
    expect(result).toBe('{"c":{"b":{"a":1}}}');
  });

  it('handles empty object', () => {
    expect(serialize({})).toBe('{}');
  });

  it('handles empty array', () => {
    expect(serialize([])).toBe('[]');
  });
});
