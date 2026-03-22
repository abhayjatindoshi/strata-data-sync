import { describe, it, expect } from 'vitest';
import { parseEntityId, buildEntityId, getEntityKey, buildEntityKey } from '@strata/entity/entity-key';

describe('parseEntityId', () => {
  it('parses a valid entity ID', () => {
    const parts = parseEntityId('Transaction.2025.a8Kx3mPq');
    expect(parts).toEqual({
      entityName: 'Transaction',
      partitionKey: '2025',
      uniqueId: 'a8Kx3mPq',
    });
  });

  it('parses an ID with multi-segment partition key', () => {
    const parts = parseEntityId('Transaction.2025-06.xYz12345');
    expect(parts).toEqual({
      entityName: 'Transaction',
      partitionKey: '2025-06',
      uniqueId: 'xYz12345',
    });
  });

  it('throws on ID without dots', () => {
    expect(() => parseEntityId('noDots')).toThrow('Invalid entity ID format');
  });

  it('throws on ID with only one dot', () => {
    expect(() => parseEntityId('One.dot')).toThrow('Invalid entity ID format');
  });
});

describe('buildEntityId', () => {
  it('builds a valid entity ID', () => {
    expect(buildEntityId('Transaction', '2025', 'a8Kx3mPq')).toBe('Transaction.2025.a8Kx3mPq');
  });

  it('works with multi-segment partition key', () => {
    expect(buildEntityId('Account', 'global', 'Zt9wR2nL')).toBe('Account.global.Zt9wR2nL');
  });
});

describe('getEntityKey', () => {
  it('extracts entity key from a full ID', () => {
    expect(getEntityKey('Transaction.2025.a8Kx3mPq')).toBe('Transaction.2025');
  });

  it('extracts entity key with multi-segment partition', () => {
    expect(getEntityKey('Account.global.Zt9wR2nL')).toBe('Account.global');
  });

  it('throws on ID without dots', () => {
    expect(() => getEntityKey('noDots')).toThrow('Invalid entity ID format');
  });
});

describe('buildEntityKey', () => {
  it('builds entity key from name and partition', () => {
    expect(buildEntityKey('Transaction', '2025')).toBe('Transaction.2025');
  });

  it('works with any partition key', () => {
    expect(buildEntityKey('Account', 'global')).toBe('Account.global');
  });
});
