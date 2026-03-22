import { describe, it, expect } from 'vitest';
import { applyQuery } from './query';
import type { BaseEntity } from '@strata/entity';

type TestEntity = BaseEntity & {
  readonly name: string;
  readonly amount: number;
  readonly category: string;
};

function makeEntity(overrides: Partial<TestEntity> & { id: string; name: string; amount: number; category: string }): TestEntity {
  return {
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    version: 1,
    device: 'test',
    ...overrides,
  };
}

const entities: TestEntity[] = [
  makeEntity({ id: 'e1', name: 'Alpha', amount: 300, category: 'food' }),
  makeEntity({ id: 'e2', name: 'Bravo', amount: 100, category: 'transport' }),
  makeEntity({ id: 'e3', name: 'Charlie', amount: 200, category: 'food' }),
  makeEntity({ id: 'e4', name: 'Delta', amount: 400, category: 'transport' }),
];

describe('applyQuery', () => {
  it('returns all entities when no options provided', () => {
    const result = applyQuery(entities);
    expect(result).toHaveLength(4);
  });

  it('returns all entities when empty options provided', () => {
    const result = applyQuery(entities, {});
    expect(result).toHaveLength(4);
  });

  describe('ids filter', () => {
    it('filters by specific IDs', () => {
      const result = applyQuery(entities, { ids: ['e1', 'e3'] });
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
    });

    it('returns empty when no IDs match', () => {
      const result = applyQuery(entities, { ids: ['nonexistent'] });
      expect(result).toHaveLength(0);
    });

    it('handles empty ids array', () => {
      const result = applyQuery(entities, { ids: [] });
      expect(result).toHaveLength(4);
    });
  });

  describe('where filter', () => {
    it('filters by single field', () => {
      const result = applyQuery(entities, { where: { category: 'food' } });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.category === 'food')).toBe(true);
    });

    it('filters by multiple fields', () => {
      const result = applyQuery(entities, { where: { category: 'food', name: 'Alpha' } });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('e1');
    });

    it('returns empty when no match', () => {
      const result = applyQuery(entities, { where: { category: 'nonexistent' } });
      expect(result).toHaveLength(0);
    });
  });

  describe('orderBy', () => {
    it('sorts ascending by numeric field', () => {
      const result = applyQuery(entities, { orderBy: [{ field: 'amount', direction: 'asc' }] });
      expect(result.map((e) => e.amount)).toEqual([100, 200, 300, 400]);
    });

    it('sorts descending by numeric field', () => {
      const result = applyQuery(entities, { orderBy: [{ field: 'amount', direction: 'desc' }] });
      expect(result.map((e) => e.amount)).toEqual([400, 300, 200, 100]);
    });

    it('sorts ascending by string field', () => {
      const result = applyQuery(entities, { orderBy: [{ field: 'name', direction: 'asc' }] });
      expect(result.map((e) => e.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    });

    it('sorts descending by string field', () => {
      const result = applyQuery(entities, { orderBy: [{ field: 'name', direction: 'desc' }] });
      expect(result.map((e) => e.name)).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
    });

    it('supports multi-field sort', () => {
      const result = applyQuery(entities, {
        orderBy: [
          { field: 'category', direction: 'asc' },
          { field: 'amount', direction: 'desc' },
        ],
      });
      expect(result.map((e) => e.id)).toEqual(['e1', 'e3', 'e4', 'e2']);
    });
  });

  describe('combined filters and sorting', () => {
    it('filters by where and sorts', () => {
      const result = applyQuery(entities, {
        where: { category: 'food' },
        orderBy: [{ field: 'amount', direction: 'asc' }],
      });
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.amount)).toEqual([200, 300]);
    });

    it('filters by ids, where, and sorts', () => {
      const result = applyQuery(entities, {
        ids: ['e1', 'e2', 'e3'],
        where: { category: 'food' },
        orderBy: [{ field: 'name', direction: 'desc' }],
      });
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.name)).toEqual(['Charlie', 'Alpha']);
    });
  });

  it('does not mutate the original array', () => {
    const original = [...entities];
    applyQuery(entities, { orderBy: [{ field: 'amount', direction: 'desc' }] });
    expect(entities.map((e) => e.id)).toEqual(original.map((e) => e.id));
  });
});
