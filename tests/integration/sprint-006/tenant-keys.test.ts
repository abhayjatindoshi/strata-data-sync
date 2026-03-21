import { describe, it, expect } from 'vitest';
import {
  scopeEntityKey,
  scopeMetadataKey,
  unscopeEntityKey,
  scopePrefix,
  TENANT_LIST_KEY,
} from '../../../src/tenant/index.js';

describe('Integration: Tenant Key Namespacing', () => {
  describe('scopeEntityKey', () => {
    it('prepends tenant:{tenantId}: to entity key', () => {
      expect(scopeEntityKey('t1', 'Account.global')).toBe('tenant:t1:Account.global');
    });

    it('handles complex partition keys', () => {
      expect(scopeEntityKey('org-42', 'Transaction.2025-03')).toBe(
        'tenant:org-42:Transaction.2025-03',
      );
    });
  });

  describe('scopeMetadataKey', () => {
    it('returns tenant-scoped metadata key', () => {
      expect(scopeMetadataKey('t1')).toBe('tenant:t1:__metadata');
    });
  });

  describe('unscopeEntityKey', () => {
    it('extracts tenantId and entityKey from scoped key', () => {
      const result = unscopeEntityKey('tenant:t1:Account.global');
      expect(result).toEqual({ tenantId: 't1', entityKey: 'Account.global' });
    });

    it('returns undefined for unscoped key', () => {
      expect(unscopeEntityKey('Account.global')).toBeUndefined();
    });

    it('returns undefined for malformed scoped key', () => {
      expect(unscopeEntityKey('tenant:')).toBeUndefined();
    });

    it('handles tenant IDs with hyphens', () => {
      const result = unscopeEntityKey('tenant:my-org-123:Todo.2025');
      expect(result).toEqual({ tenantId: 'my-org-123', entityKey: 'Todo.2025' });
    });
  });

  describe('scopePrefix', () => {
    it('returns the prefix string for a tenant', () => {
      expect(scopePrefix('abc')).toBe('tenant:abc:');
    });
  });

  describe('TENANT_LIST_KEY', () => {
    it('is the well-known constant', () => {
      expect(TENANT_LIST_KEY).toBe('__tenants');
    });
  });
});
