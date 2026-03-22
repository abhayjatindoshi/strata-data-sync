import { describe, it, expect } from 'vitest';
import { parseEntityId, getEntityKey } from './parse-entity-id.js';

describe('parseEntityId', () => {
  it('parses a valid entity ID', () => {
    const result = parseEntityId('todo._.abc123');
    expect(result).toEqual({
      entityName: 'todo',
      partitionKey: '_',
      uniqueId: 'abc123',
    });
  });

  it('parses entity ID with partition key', () => {
    const result = parseEntityId('todo.2024-01.xyz');
    expect(result).toEqual({
      entityName: 'todo',
      partitionKey: '2024-01',
      uniqueId: 'xyz',
    });
  });

  it('throws on too few parts', () => {
    expect(() => parseEntityId('todo.abc')).toThrow('Invalid entity ID format');
  });

  it('throws on too many parts', () => {
    expect(() => parseEntityId('todo._.abc.extra')).toThrow('Invalid entity ID format');
  });

  it('throws on empty string', () => {
    expect(() => parseEntityId('')).toThrow('Invalid entity ID format');
  });
});

describe('getEntityKey', () => {
  it('returns entity key from entity ID', () => {
    expect(getEntityKey('todo._.abc123')).toBe('todo._');
  });

  it('returns entity key with partition', () => {
    expect(getEntityKey('todo.2024-01.xyz')).toBe('todo.2024-01');
  });
});
