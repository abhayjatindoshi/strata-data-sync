import { describe, it, expect } from 'vitest';
import { deriveId } from '@strata/entity/derive-id.js';

describe('deriveId', () => {
  it('returns the derived ID from the function', () => {
    const fn = deriveId<{ name: string }>(e => e.name);
    expect(fn({ name: 'hello' })).toBe('hello');
  });

  it('throws if derived ID contains dots', () => {
    const fn = deriveId<{ name: string }>(e => e.name);
    expect(() => fn({ name: 'hello.world' })).toThrow('must not contain dots');
  });

  it('allows hyphens and underscores', () => {
    const fn = deriveId<{ name: string }>(e => e.name);
    expect(fn({ name: 'hello-world_123' })).toBe('hello-world_123');
  });
});
