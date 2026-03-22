import { describe, it, expect } from 'vitest';
import { defineTenant } from '@strata/tenant/tenant-entity';
import type { BaseTenant, TenantDef } from '@strata/tenant/tenant-entity';

describe('defineTenant', () => {
  it('creates a tenant entity definition with name __tenant', () => {
    const def = defineTenant();
    expect(def.name).toBe('__tenant');
  });

  it('creates a def with no custom fields', () => {
    const def = defineTenant();
    expect(def).toBeDefined();
    expect(def.name).toBe('__tenant');
  });

  it('accepts custom field type parameter', () => {
    const def = defineTenant<{ provider: string; region: string }>();
    expect(def.name).toBe('__tenant');
  });

  it('type-checks BaseTenant has required fields', () => {
    const tenant: BaseTenant = {
      id: 'tenant-1',
      name: 'My Workspace',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev-1',
    };
    expect(tenant.name).toBe('My Workspace');
    expect(tenant.id).toBe('tenant-1');
  });

  it('type-checks TenantDef is an EntityDef', () => {
    const def: TenantDef = defineTenant();
    expect(def.name).toBe('__tenant');
  });
});
