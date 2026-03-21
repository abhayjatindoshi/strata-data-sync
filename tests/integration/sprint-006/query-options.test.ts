import { describe, it, expect } from 'vitest';
import { applyQuery } from '../../../src/store/index.js';
import type { QueryOptions } from '../../../src/store/index.js';

type Item = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly priority: number;
  readonly done: boolean;
};

const items: ReadonlyArray<Item> = [
  { id: 'i1', name: 'Alpha', category: 'work', priority: 3, done: false },
  { id: 'i2', name: 'Bravo', category: 'home', priority: 1, done: true },
  { id: 'i3', name: 'Charlie', category: 'work', priority: 2, done: false },
  { id: 'i4', name: 'Delta', category: 'home', priority: 4, done: false },
  { id: 'i5', name: 'Echo', category: 'work', priority: 1, done: true },
];

describe('Integration: Query Options', () => {
  describe('filter by IDs', () => {
    it('returns only entities matching the given ids', () => {
      const result = applyQuery(items, { ids: ['i2', 'i4'] });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['i2', 'i4']);
    });

    it('returns empty array when no ids match', () => {
      const result = applyQuery(items, { ids: ['nonexistent'] });
      expect(result).toHaveLength(0);
    });

    it('returns all when ids is empty array', () => {
      const result = applyQuery(items, { ids: [] });
      expect(result).toHaveLength(5);
    });
  });

  describe('field matching (where)', () => {
    it('filters by a single field', () => {
      const result = applyQuery(items, { where: { category: 'work' } });
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.category === 'work')).toBe(true);
    });

    it('filters by boolean field', () => {
      const result = applyQuery(items, { where: { done: true } });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['i2', 'i5']);
    });

    it('filters by multiple fields (AND logic)', () => {
      const result = applyQuery(items, { where: { category: 'work', done: false } });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['i1', 'i3']);
    });

    it('returns empty when no entities match where clause', () => {
      const result = applyQuery(items, { where: { category: 'personal' as string } });
      expect(result).toHaveLength(0);
    });
  });

  describe('multi-field sorting', () => {
    it('sorts ascending by a single field', () => {
      const result = applyQuery(items, { orderBy: [{ field: 'priority', direction: 'asc' }] });
      const priorities = result.map((r) => r.priority);
      expect(priorities).toEqual([1, 1, 2, 3, 4]);
    });

    it('sorts descending by a single field', () => {
      const result = applyQuery(items, { orderBy: [{ field: 'priority', direction: 'desc' }] });
      const priorities = result.map((r) => r.priority);
      expect(priorities).toEqual([4, 3, 2, 1, 1]);
    });

    it('sorts by multiple fields', () => {
      const result = applyQuery(items, {
        orderBy: [
          { field: 'category', direction: 'asc' },
          { field: 'priority', direction: 'desc' },
        ],
      });
      expect(result[0].category).toBe('home');
      expect(result[0].priority).toBe(4);
      expect(result[1].category).toBe('home');
      expect(result[1].priority).toBe(1);
      expect(result[2].category).toBe('work');
    });

    it('sorts strings alphabetically', () => {
      const result = applyQuery(items, { orderBy: [{ field: 'name', direction: 'asc' }] });
      expect(result.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);
    });
  });

  describe('combined queries', () => {
    it('applies ids + where together', () => {
      const result = applyQuery(items, { ids: ['i1', 'i2', 'i3'], where: { category: 'work' } });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['i1', 'i3']);
    });

    it('applies where + orderBy together', () => {
      const result = applyQuery(items, {
        where: { category: 'work' },
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.priority)).toEqual([1, 2, 3]);
    });

    it('applies ids + where + orderBy together', () => {
      const result = applyQuery(items, {
        ids: ['i1', 'i3', 'i5'],
        where: { done: false },
        orderBy: [{ field: 'priority', direction: 'desc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('i1');
      expect(result[1].id).toBe('i3');
    });

    it('returns all entities unchanged when no options are provided', () => {
      const result = applyQuery(items);
      expect(result).toEqual(items);
    });
  });
});
