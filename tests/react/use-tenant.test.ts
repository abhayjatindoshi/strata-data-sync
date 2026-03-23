import { describe, it, expect } from 'vitest';
import { useTenant, useTenantList, useIsDirty } from '@strata/react/use-tenant.js';

describe('useTenant', () => {
  it('exports useTenant function', () => {
    expect(typeof useTenant).toBe('function');
  });
});

describe('useTenantList', () => {
  it('exports useTenantList function', () => {
    expect(typeof useTenantList).toBe('function');
  });
});

describe('useIsDirty', () => {
  it('exports useIsDirty function', () => {
    expect(typeof useIsDirty).toBe('function');
  });
});
