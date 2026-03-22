import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from './serializer.js';

describe('serialize', () => {
  it('should serialize Date to type marker', () => {
    const obj = { date: new Date('2024-01-01T00:00:00.000Z') };
    const json = serialize(obj);
    const parsed = JSON.parse(json);
    expect(parsed.date).toEqual({ __t: 'D', v: '2024-01-01T00:00:00.000Z' });
  });

  it('should pass through non-Date values', () => {
    const obj = { name: 'test', count: 42, active: true };
    const json = serialize(obj);
    expect(JSON.parse(json)).toEqual(obj);
  });

  it('should handle nested Date objects', () => {
    const obj = { nested: { date: new Date('2024-06-15T12:30:00.000Z') } };
    const json = serialize(obj);
    const parsed = JSON.parse(json);
    expect(parsed.nested.date).toEqual({
      __t: 'D',
      v: '2024-06-15T12:30:00.000Z',
    });
  });

  it('should handle arrays with Dates', () => {
    const arr = [new Date('2024-01-01'), new Date('2024-02-01')];
    const json = serialize(arr);
    const parsed = JSON.parse(json);
    expect(parsed[0].__t).toBe('D');
    expect(parsed[1].__t).toBe('D');
  });
});

describe('deserialize', () => {
  it('should deserialize type marker back to Date', () => {
    const json = '{"date":{"__t":"D","v":"2024-01-01T00:00:00.000Z"}}';
    const result = deserialize(json) as { date: Date };
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should round-trip Date correctly', () => {
    const original = {
      date: new Date('2024-03-15T10:00:00.000Z'),
      name: 'test',
    };
    const result = deserialize(serialize(original)) as typeof original;
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.toISOString()).toBe('2024-03-15T10:00:00.000Z');
    expect(result.name).toBe('test');
  });

  it('should pass through non-marker objects', () => {
    const json = '{"foo":"bar","count":42}';
    expect(deserialize(json)).toEqual({ foo: 'bar', count: 42 });
  });

  it('should handle nested type markers', () => {
    const original = {
      a: { date: new Date('2024-01-01T00:00:00.000Z') },
      b: { date: new Date('2024-12-31T23:59:59.000Z') },
    };
    const result = deserialize(serialize(original)) as typeof original;
    expect(result.a.date).toBeInstanceOf(Date);
    expect(result.b.date).toBeInstanceOf(Date);
  });
});
