import { describe, it, expect } from 'vitest';
import { useRepo } from './use-repo.js';

describe('useRepo', () => {
  it('exports useRepo function', () => {
    expect(typeof useRepo).toBe('function');
  });
});
