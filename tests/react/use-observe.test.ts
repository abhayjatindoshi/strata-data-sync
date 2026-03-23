import { describe, it, expect } from 'vitest';
import { useObserve, useQuery } from '@strata/react/use-observe.js';

describe('useObserve', () => {
  it('exports useObserve function', () => {
    expect(typeof useObserve).toBe('function');
  });
});

describe('useQuery', () => {
  it('exports useQuery function', () => {
    expect(typeof useQuery).toBe('function');
  });
});
