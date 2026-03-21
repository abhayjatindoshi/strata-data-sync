import { describe, it, expect } from 'vitest';
import { dateKeyStrategy } from './date-key-strategy.js';

describe('dateKeyStrategy', () => {
  describe('year period', () => {
    const strategy = dateKeyStrategy({ period: 'year' });

    it('extracts year from entity date field', () => {
      const key = strategy.getPartitionKey('Transaction', {
        createdAt: new Date('2025-06-15T10:30:00Z'),
      });
      expect(key).toBe('2025');
    });

    it('falls back to current date when field is missing', () => {
      const key = strategy.getPartitionKey('Transaction', {});
      expect(key).toBe(new Date().getUTCFullYear().toString());
    });
  });

  describe('month period', () => {
    const strategy = dateKeyStrategy({ period: 'month' });

    it('extracts year-month from entity date field', () => {
      const key = strategy.getPartitionKey('Transaction', {
        createdAt: new Date('2025-01-05T00:00:00Z'),
      });
      expect(key).toBe('2025-01');
    });

    it('pads single-digit months', () => {
      const key = strategy.getPartitionKey('Transaction', {
        createdAt: new Date('2025-03-15T00:00:00Z'),
      });
      expect(key).toBe('2025-03');
    });
  });

  describe('day period', () => {
    const strategy = dateKeyStrategy({ period: 'day' });

    it('extracts full date from entity date field', () => {
      const key = strategy.getPartitionKey('Transaction', {
        createdAt: new Date('2025-12-25T00:00:00Z'),
      });
      expect(key).toBe('2025-12-25');
    });

    it('pads single-digit day and month', () => {
      const key = strategy.getPartitionKey('Transaction', {
        createdAt: new Date('2025-02-03T00:00:00Z'),
      });
      expect(key).toBe('2025-02-03');
    });
  });

  describe('custom field', () => {
    const strategy = dateKeyStrategy({ period: 'year', field: 'date' });

    it('reads from custom field', () => {
      const key = strategy.getPartitionKey('Transaction', {
        date: new Date('2024-07-01T00:00:00Z'),
      });
      expect(key).toBe('2024');
    });
  });

  describe('getRelevantKeys', () => {
    const strategy = dateKeyStrategy({ period: 'year' });

    it('returns empty array (all keys relevant)', () => {
      expect(strategy.getRelevantKeys('Transaction')).toEqual([]);
    });

    it('returns empty array with filter', () => {
      expect(strategy.getRelevantKeys('Transaction', { year: 2025 })).toEqual([]);
    });
  });
});
