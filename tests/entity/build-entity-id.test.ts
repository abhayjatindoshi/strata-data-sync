import { describe, it, expect } from 'vitest';
import { buildEntityId } from '@strata/entity/build-entity-id.js';

describe('buildEntityId', () => {
  it('builds entity ID from parts', () => {
    expect(buildEntityId('todo', '_', 'abc123')).toBe('todo._.abc123');
  });

  it('builds entity ID with partition key', () => {
    expect(buildEntityId('todo', '2024-01', 'xyz')).toBe('todo.2024-01.xyz');
  });

  it('throws if entity name contains dots', () => {
    expect(() => buildEntityId('to.do', '_', 'abc')).toThrow('must not contain dots');
  });

  it('throws if partition key contains dots', () => {
    expect(() => buildEntityId('todo', 'a.b', 'abc')).toThrow('must not contain dots');
  });

  it('throws if unique ID contains dots', () => {
    expect(() => buildEntityId('todo', '_', 'a.b')).toThrow('must not contain dots');
  });
});
