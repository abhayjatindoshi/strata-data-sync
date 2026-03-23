import { describe, it, expect } from 'vitest';
import { useRepo } from '@strata/react/use-repo.js';

describe('useRepo', () => {
  it('exports useRepo function', () => {
    expect(typeof useRepo).toBe('function');
  });
});
