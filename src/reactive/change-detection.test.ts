import { describe, it, expect } from 'vitest';
import { entityEquals, entityArrayEquals } from './change-detection.js';

describe('entityEquals', () => {
  it('should return true for same reference', () => {
    const e = { id: 'a', version: 1 };
    expect(entityEquals(e, e)).toBe(true);
  });

  it('should return true for same id and version', () => {
    expect(
      entityEquals({ id: 'a', version: 1 }, { id: 'a', version: 1 }),
    ).toBe(true);
  });

  it('should return false for different version', () => {
    expect(
      entityEquals({ id: 'a', version: 1 }, { id: 'a', version: 2 }),
    ).toBe(false);
  });

  it('should return false for different id', () => {
    expect(
      entityEquals({ id: 'a', version: 1 }, { id: 'b', version: 1 }),
    ).toBe(false);
  });

  it('should handle undefined values', () => {
    expect(entityEquals(undefined, undefined)).toBe(true);
    expect(entityEquals({ id: 'a', version: 1 }, undefined)).toBe(false);
    expect(entityEquals(undefined, { id: 'a', version: 1 })).toBe(false);
  });
});

describe('entityArrayEquals', () => {
  it('should return true for same reference', () => {
    const arr = [{ id: 'a', version: 1 }];
    expect(entityArrayEquals(arr, arr)).toBe(true);
  });

  it('should return true for equal arrays', () => {
    const a = [{ id: 'a', version: 1 }, { id: 'b', version: 2 }];
    const b = [{ id: 'a', version: 1 }, { id: 'b', version: 2 }];
    expect(entityArrayEquals(a, b)).toBe(true);
  });

  it('should return false for different lengths', () => {
    const a = [{ id: 'a', version: 1 }];
    const b = [{ id: 'a', version: 1 }, { id: 'b', version: 2 }];
    expect(entityArrayEquals(a, b)).toBe(false);
  });

  it('should return false for different elements', () => {
    const a = [{ id: 'a', version: 1 }];
    const b = [{ id: 'a', version: 2 }];
    expect(entityArrayEquals(a, b)).toBe(false);
  });

  it('should return true for empty arrays', () => {
    expect(entityArrayEquals([], [])).toBe(true);
  });
});
