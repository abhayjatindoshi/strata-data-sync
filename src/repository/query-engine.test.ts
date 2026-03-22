import { describe, it, expect } from 'vitest';
import type { BaseEntity } from '../entity/index.js';
import { executeQuery } from './query-engine.js';

type TestEntity = BaseEntity & {
  readonly name: string;
  readonly value: number;
};

function make(id: string, name: string, value: number): TestEntity {
  return {
    id,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    version: 1,
    device: 'test',
    hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' },
    name,
    value,
  };
}

const entities: ReadonlyArray<TestEntity> = [
  make('a', 'Alice', 30),
  make('b', 'Bob', 20),
  make('c', 'Charlie', 40),
  make('d', 'Diana', 10),
];

describe('executeQuery', () => {
  it('returns all entities when no options', () => {
    expect(executeQuery(entities)).toBe(entities);
  });

  it('filters with == operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'name', op: '==', value: 'Alice' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Alice');
  });

  it('filters with != operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'name', op: '!=', value: 'Alice' }],
    });
    expect(result).toHaveLength(3);
  });

  it('filters with < operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'value', op: '<', value: 25 }],
    });
    expect(result).toHaveLength(2);
  });

  it('filters with <= operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'value', op: '<=', value: 20 }],
    });
    expect(result).toHaveLength(2);
  });

  it('filters with > operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'value', op: '>', value: 25 }],
    });
    expect(result).toHaveLength(2);
  });

  it('filters with >= operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'value', op: '>=', value: 30 }],
    });
    expect(result).toHaveLength(2);
  });

  it('filters with in operator', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'name', op: 'in', value: ['Alice', 'Bob'] }],
    });
    expect(result).toHaveLength(2);
  });

  it('applies multiple where clauses with AND logic', () => {
    const result = executeQuery(entities, {
      where: [
        { field: 'value', op: '>', value: 15 },
        { field: 'value', op: '<', value: 35 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Bob']);
  });

  it('sorts ascending', () => {
    const result = executeQuery(entities, {
      orderBy: [{ field: 'value', direction: 'asc' }],
    });
    expect(result.map(e => e.value)).toEqual([10, 20, 30, 40]);
  });

  it('sorts descending', () => {
    const result = executeQuery(entities, {
      orderBy: [{ field: 'value', direction: 'desc' }],
    });
    expect(result.map(e => e.value)).toEqual([40, 30, 20, 10]);
  });

  it('sorts by string field', () => {
    const result = executeQuery(entities, {
      orderBy: [{ field: 'name', direction: 'asc' }],
    });
    expect(result.map(e => e.name)).toEqual([
      'Alice', 'Bob', 'Charlie', 'Diana',
    ]);
  });

  it('applies offset', () => {
    const result = executeQuery(entities, {
      orderBy: [{ field: 'value', direction: 'asc' }],
      offset: 2,
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.value).toBe(30);
  });

  it('applies limit', () => {
    const result = executeQuery(entities, {
      orderBy: [{ field: 'value', direction: 'asc' }],
      limit: 2,
    });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.value)).toEqual([10, 20]);
  });

  it('applies offset + limit together', () => {
    const result = executeQuery(entities, {
      orderBy: [{ field: 'value', direction: 'asc' }],
      offset: 1,
      limit: 2,
    });
    expect(result.map(e => e.value)).toEqual([20, 30]);
  });

  it('applies where + orderBy + offset + limit', () => {
    const result = executeQuery(entities, {
      where: [{ field: 'value', op: '>', value: 10 }],
      orderBy: [{ field: 'value', direction: 'desc' }],
      offset: 1,
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Alice');
  });
});
