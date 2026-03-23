import { describe, it, expect } from 'vitest';
import { StrataProvider, useStrata } from '@strata/react/strata-provider.js';
import type { StrataProviderProps } from '@strata/react/strata-provider.js';

describe('StrataProvider', () => {
  it('exports StrataProvider function', () => {
    expect(typeof StrataProvider).toBe('function');
  });

  it('exports useStrata hook', () => {
    expect(typeof useStrata).toBe('function');
  });

  it('StrataProviderProps type is usable', () => {
    // Type-level test — just verify the type is importable
    const _props: StrataProviderProps | undefined = undefined;
    expect(_props).toBeUndefined();
  });
});
