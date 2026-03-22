import { describe, it, expect } from 'vitest';
import {
  TENANT_LIST_KEY,
  scopeEntityKey,
  scopeMetadataKey,
  unscopeEntityKey,
  scopePrefix,
} from './tenant-keys';

describe('tenant key namespacing', () => {
  describe('TENANT_LIST_KEY', () => {
    it('is __tenants', () => {
      expect(TENANT_LIST_KEY).toBe('__tenants');
    });
  });

  describe('scopeEntityKey', () => {
    it('prepends tenant:{tenantId}: to entity key', () => {
      expect(scopeEntityKey('t1', 'Account.2025')).toBe('tenant:t1:Account.2025');
    });

    it('works with complex partition keys', () => {
      expect(scopeEntityKey('workspace-abc', 'Transaction.2025-Q1')).toBe(
        'tenant:workspace-abc:Transaction.2025-Q1',
      );
    });
  });

  describe('scopeMetadataKey', () => {
    it('creates tenant-scoped metadata key', () => {
      expect(scopeMetadataKey('t1')).toBe('tenant:t1:__metadata');
    });
  });

  describe('unscopeEntityKey', () => {
    it('extracts tenantId and entityKey from scoped key', () => {
      const result = unscopeEntityKey('tenant:t1:Account.2025');
      expect(result).toEqual({ tenantId: 't1', entityKey: 'Account.2025' });
    });

    it('returns undefined for non-scoped key', () => {
      expect(unscopeEntityKey('Account.2025')).toBeUndefined();
    });

    it('returns undefined for malformed tenant key', () => {
      expect(unscopeEntityKey('tenant:')).toBeUndefined();
    });

    it('handles metadata keys', () => {
      const result = unscopeEntityKey('tenant:t1:__metadata');
      expect(result).toEqual({ tenantId: 't1', entityKey: '__metadata' });
    });
  });

  describe('scopePrefix', () => {
    it('returns the prefix for a tenant', () => {
      expect(scopePrefix('t1')).toBe('tenant:t1:');
    });
  });
});
