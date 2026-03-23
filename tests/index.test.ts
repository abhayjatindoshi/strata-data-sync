import { describe, it, expect } from 'vitest';
import { hello } from '@strata/index';

describe('hello', () => {
  it('returns greeting with the given name', () => {
    expect(hello('World')).toBe('Hello, World!');
  });

  it('handles empty string', () => {
    expect(hello('')).toBe('Hello, !');
  });
});
