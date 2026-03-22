import { describe, it, expect } from 'vitest';
import { generateId } from '@strata/entity/id-generation';

describe('generateId', () => {
  it('returns a string of default length 8', () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });

  it('returns a string of custom length', () => {
    const id = generateId(12);
    expect(id).toHaveLength(12);
  });

  it('contains only alphanumeric characters', () => {
    const id = generateId(100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
