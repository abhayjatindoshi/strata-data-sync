// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '../strata/index.js';
import type { TenantManager } from '../tenant/index.js';
import type { BaseTenant } from '../tenant/index.js';
import { StrataProvider } from './strata-context.js';
import { TenantProvider } from './tenant-context.js';
import { useTenant } from './use-tenant.js';

function makeTenant(id: string, name: string): BaseTenant {
  return { id, name, createdAt: new Date(), updatedAt: new Date(), version: 1, device: 'test' };
}

describe('useTenant', () => {
  it('returns tenant context value', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const tm: TenantManager = {
      list: vi.fn().mockResolvedValue([tenantA]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(tenantA),
    } as unknown as TenantManager;

    const strata: Strata = {
      repo: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      tenants: tm,
      sync: vi.fn(),
      dispose: vi.fn(),
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeTenant?.id).toBe('t1');
    expect(result.current.tenants).toHaveLength(1);
    expect(typeof result.current.switchTenant).toBe('function');
    expect(typeof result.current.createTenant).toBe('function');
  });
});
