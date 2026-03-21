import { describe, it, expect } from 'vitest';
import { defineTenant } from '../../../src/tenant/index.js';
import type { BaseTenant } from '../../../src/tenant/index.js';

describe('Integration: Tenant Definition', () => {
  it('defineTenant returns an entity def with name __tenant', () => {
    const def = defineTenant();
    expect(def.name).toBe('__tenant');
  });

  it('BaseTenant includes id, name, createdAt, updatedAt, version, device', () => {
    const tenant: BaseTenant = {
      id: 'tenant-1',
      name: 'My Org',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
    };

    expect(tenant.id).toBe('tenant-1');
    expect(tenant.name).toBe('My Org');
    expect(tenant.createdAt).toBeInstanceOf(Date);
    expect(tenant.updatedAt).toBeInstanceOf(Date);
    expect(tenant.version).toBe(1);
    expect(tenant.device).toBe('dev-1');
  });

  it('defineTenant with custom fields preserves generic type', () => {
    type CustomFields = { plan: string; seats: number };
    const def = defineTenant<CustomFields>();
    expect(def.name).toBe('__tenant');
  });

  it('multiple calls to defineTenant produce independent defs', () => {
    const def1 = defineTenant();
    const def2 = defineTenant();
    expect(def1.name).toBe(def2.name);
  });
});
