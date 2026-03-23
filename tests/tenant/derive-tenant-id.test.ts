import { describe, it, expect } from 'vitest';
import { deriveTenantId } from '@strata/tenant/derive-tenant-id.js';

describe('deriveTenantId', () => {
  it('returns deterministic id for same cloudMeta', () => {
    const meta = { bucket: 's3://my-bucket', region: 'us-east-1' };
    const id1 = deriveTenantId(meta);
    const id2 = deriveTenantId(meta);
    expect(id1).toBe(id2);
  });

  it('returns different ids for different cloudMeta', () => {
    const meta1 = { bucket: 's3://bucket-a' };
    const meta2 = { bucket: 's3://bucket-b' };
    expect(deriveTenantId(meta1)).not.toBe(deriveTenantId(meta2));
  });

  it('is order-independent (keys sorted)', () => {
    const meta1 = { b: '2', a: '1' };
    const meta2 = { a: '1', b: '2' };
    expect(deriveTenantId(meta1)).toBe(deriveTenantId(meta2));
  });

  it('returns a non-empty string', () => {
    const id = deriveTenantId({ key: 'value' });
    expect(id.length).toBeGreaterThan(0);
  });
});
