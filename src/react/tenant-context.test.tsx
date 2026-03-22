// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act, waitFor, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '@strata/strata';
import type { TenantManager } from '@strata/tenant';
import type { BaseTenant } from '@strata/tenant';
import { StrataProvider } from './strata-context';
import { TenantProvider, useTenantContext } from './tenant-context';

function makeTenant(id: string, name: string): BaseTenant {
  return { id, name, createdAt: new Date(), updatedAt: new Date(), version: 1, device: 'test' };
}

function createMockStrata(tenantManager: TenantManager): Strata {
  return {
    repo: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    tenants: tenantManager,
    sync: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMockTenantManager(tenants: BaseTenant[] = []): TenantManager {
  return {
    list: vi.fn().mockResolvedValue(tenants),
    create: vi.fn(),
    load: vi.fn(),
    switch: vi.fn(),
    activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
  } as unknown as TenantManager;
}

describe('TenantProvider', () => {
  let tenantA: BaseTenant;
  let tenantB: BaseTenant;

  beforeEach(() => {
    tenantA = makeTenant('t1', 'Tenant A');
    tenantB = makeTenant('t2', 'Tenant B');
  });

  it('renders children and loads tenant list', async () => {
    const tm = createMockTenantManager([tenantA, tenantB]);
    const strata = createMockStrata(tm);

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <div data-testid="child">OK</div>
        </TenantProvider>
      </StrataProvider>,
    );

    expect(screen.getByTestId('child').textContent).toBe('OK');
    await waitFor(() => expect(tm.list).toHaveBeenCalled());
  });

  it('provides tenant list and active tenant via context', async () => {
    const tm = createMockTenantManager([tenantA, tenantB]);
    const strata = createMockStrata(tm);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );

    const { result } = renderHook(() => useTenantContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenants).toHaveLength(2);
    expect(result.current.activeTenant).toBeUndefined();
  });

  it('reflects active tenant changes from observable', async () => {
    const activeTenant$ = new BehaviorSubject<BaseTenant | undefined>(undefined);
    const tm = {
      ...createMockTenantManager([tenantA]),
      activeTenant$,
    } as unknown as TenantManager;
    const strata = createMockStrata(tm);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );

    const { result } = renderHook(() => useTenantContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeTenant).toBeUndefined();

    act(() => { activeTenant$.next(tenantA); });

    await waitFor(() => expect(result.current.activeTenant?.id).toBe('t1'));
  });

  it('switchTenant calls tenant manager', async () => {
    const tm = createMockTenantManager([tenantA, tenantB]);
    (tm.switch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const strata = createMockStrata(tm);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );

    const { result } = renderHook(() => useTenantContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.switchTenant('t2');
    });

    expect(tm.switch).toHaveBeenCalledWith('t2');
  });
});

describe('useTenantContext', () => {
  it('throws when used outside TenantProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTenantContext())).toThrow(
      'useTenantContext must be used within a TenantProvider',
    );
    spy.mockRestore();
  });
});
