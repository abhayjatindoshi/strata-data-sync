import { describe, it, expect } from 'vitest';
import { deserialize } from '@strata/persistence/deserialize';

const VALID_BLOB = JSON.stringify({
  Account: {
    'Account.global.abc': { id: 'Account.global.abc', name: 'Checking', updatedAt: '2025-01-01' },
    'Account.global.def': { id: 'Account.global.def', name: 'Savings', updatedAt: '2025-01-01' },
  },
  deleted: {
    Account: {
      'Account.global.old1': '2025-06-15T10:30:00.000Z',
    },
  },
});

describe('deserialize', () => {
  it('parses a valid partition blob', () => {
    const blob = deserialize(VALID_BLOB);
    expect(blob.entities['Account']).toBeDefined();
    expect(blob.entities['Account']!['Account.global.abc']!['name']).toBe('Checking');
    expect(blob.entities['Account']!['Account.global.def']!['name']).toBe('Savings');
  });

  it('parses deleted entries', () => {
    const blob = deserialize(VALID_BLOB);
    expect(blob.deleted['Account']).toBeDefined();
    expect(blob.deleted['Account']!['Account.global.old1']).toBe('2025-06-15T10:30:00.000Z');
  });

  it('handles blob with no deleted section', () => {
    const json = JSON.stringify({
      Account: {
        'Account.global.abc': { id: 'Account.global.abc', name: 'Test' },
      },
    });
    const blob = deserialize(json);
    expect(blob.entities['Account']).toBeDefined();
    expect(blob.deleted).toEqual({});
  });

  it('handles empty blob', () => {
    const blob = deserialize('{}');
    expect(blob.entities).toEqual({});
    expect(blob.deleted).toEqual({});
  });

  it('handles multiple entity types', () => {
    const json = JSON.stringify({
      Account: {
        'Account.global.a1': { id: 'Account.global.a1', name: 'Test' },
      },
      Transaction: {
        'Transaction.2025.t1': { id: 'Transaction.2025.t1', amount: 100 },
      },
    });
    const blob = deserialize(json);
    expect(Object.keys(blob.entities)).toHaveLength(2);
    expect(blob.entities['Account']).toBeDefined();
    expect(blob.entities['Transaction']).toBeDefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => deserialize('not json')).toThrow();
  });

  it('throws on non-object root', () => {
    expect(() => deserialize('"hello"')).toThrow('Invalid blob: expected an object');
    expect(() => deserialize('[]')).toThrow('Invalid blob: expected an object');
    expect(() => deserialize('42')).toThrow('Invalid blob: expected an object');
  });

  it('throws when entity group is not an object', () => {
    const json = JSON.stringify({ Account: 'invalid' });
    expect(() => deserialize(json)).toThrow('entries for "Account" must be an object');
  });

  it('throws when entity data is not an object', () => {
    const json = JSON.stringify({ Account: { 'Account.global.abc': 'invalid' } });
    expect(() => deserialize(json)).toThrow('entity data for "Account.global.abc" must be an object');
  });

  it('throws when entity data has no id field', () => {
    const json = JSON.stringify({ Account: { 'Account.global.abc': { name: 'Missing id' } } });
    expect(() => deserialize(json)).toThrow('must have a string "id" field');
  });

  it('throws when deleted section is not an object', () => {
    const json = JSON.stringify({ deleted: 'invalid' });
    expect(() => deserialize(json)).toThrow('"deleted" must be an object');
  });

  it('throws when deleted entries group is not an object', () => {
    const json = JSON.stringify({ deleted: { Account: 'invalid' } });
    expect(() => deserialize(json)).toThrow('deleted entries for "Account" must be an object');
  });

  it('throws when deleted timestamp is not a string', () => {
    const json = JSON.stringify({ deleted: { Account: { 'Account.global.x': 123 } } });
    expect(() => deserialize(json)).toThrow('deleted timestamp for "Account.global.x" must be a string');
  });
});
