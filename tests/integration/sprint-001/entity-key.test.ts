import { describe, it, expect } from 'vitest';
import {
  parseEntityId,
  buildEntityId,
  getEntityKey,
  buildEntityKey,
  composeEntityId,
  dateKeyStrategy,
} from '../../../src/index.js';

describe('Sprint 001 Integration: Entity Key Parsing & Composition', () => {
  describe('buildEntityId + parseEntityId round-trip', () => {
    it('round-trips a simple entity ID', () => {
      const id = buildEntityId('todo', '2025-06', 'abc123XY');
      const parts = parseEntityId(id);
      expect(parts).toEqual({
        entityName: 'todo',
        partitionKey: '2025-06',
        uniqueId: 'abc123XY',
      });
    });

    it('round-trips an ID with year-only partition key', () => {
      const id = buildEntityId('report', '2024', 'Zz9aQwEr');
      const parts = parseEntityId(id);
      expect(parts.entityName).toBe('report');
      expect(parts.partitionKey).toBe('2024');
      expect(parts.uniqueId).toBe('Zz9aQwEr');
    });

    it('round-trips an ID with day partition key', () => {
      const id = buildEntityId('log', '2025-03-21', 'uniqueXX');
      const parts = parseEntityId(id);
      expect(parts.entityName).toBe('log');
      expect(parts.partitionKey).toBe('2025-03-21');
      expect(parts.uniqueId).toBe('uniqueXX');
    });
  });

  describe('getEntityKey', () => {
    it('extracts entity key (name + partition) from a full ID', () => {
      const id = buildEntityId('invoice', '2025-06', 'abc12345');
      const key = getEntityKey(id);
      expect(key).toBe('invoice.2025-06');
    });

    it('matches buildEntityKey output', () => {
      const entityName = 'task';
      const partitionKey = '2025-03';
      const uniqueId = 'Xy7pQr1z';

      const id = buildEntityId(entityName, partitionKey, uniqueId);
      const extractedKey = getEntityKey(id);
      const builtKey = buildEntityKey(entityName, partitionKey);
      expect(extractedKey).toBe(builtKey);
    });
  });

  describe('parseEntityId error handling', () => {
    it('throws on empty string', () => {
      expect(() => parseEntityId('')).toThrow('Invalid entity ID format');
    });

    it('throws on single-segment string', () => {
      expect(() => parseEntityId('todo')).toThrow('Invalid entity ID format');
    });

    it('throws on two-segment string (missing uniqueId)', () => {
      expect(() => parseEntityId('todo.2025')).toThrow('Invalid entity ID format');
    });
  });

  describe('composeEntityId + parseEntityId end-to-end', () => {
    it('composes an ID that can be parsed back correctly', () => {
      const strategy = dateKeyStrategy({ period: 'month' });
      const date = new Date('2025-08-15T12:00:00Z');
      const entity = { createdAt: date };

      const id = composeEntityId(strategy, 'task', entity);
      const parts = parseEntityId(id);

      expect(parts.entityName).toBe('task');
      expect(parts.partitionKey).toBe('2025-08');
      expect(parts.uniqueId).toHaveLength(8);
    });

    it('entity key from composed ID matches buildEntityKey', () => {
      const strategy = dateKeyStrategy({ period: 'day' });
      const date = new Date('2025-01-10T00:00:00Z');
      const entity = { createdAt: date };

      const id = composeEntityId(strategy, 'event', entity);
      const key = getEntityKey(id);
      expect(key).toBe(buildEntityKey('event', '2025-01-10'));
    });
  });
});
