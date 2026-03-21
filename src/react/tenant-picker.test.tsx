// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '../strata/index.js';
import type { TenantManager } from '../tenant/index.js';
import type { BaseTenant } from '../tenant/index.js';
import { StrataProvider } from './strata-context.js';
import { TenantProvider } from './tenant-context.js';
import { TenantPicker } from './tenant-picker.js';

function makeTenant(id: string, name: string): BaseTenant {
  return { id, name, createdAt: new Date(), updatedAt: new Date(), version: 1, device: 'test' };
}

describe('TenantPicker', () => {
  let tenantA: BaseTenant;
  let tenantB: BaseTenant;
  let tm: TenantManager;
  let strata: Strata;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );
  }

  beforeEach(() => {
    tenantA = makeTenant('t1', 'Alpha');
    tenantB = makeTenant('t2', 'Beta');
    tm = {
      list: vi.fn().mockResolvedValue([tenantA, tenantB]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn().mockResolvedValue(undefined),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;
    strata = {
      repo: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      tenants: tm,
      sync: vi.fn(),
      dispose: vi.fn(),
    };
  });

  it('shows loading state initially', () => {
    render(<TenantPicker />, { wrapper });
    expect(screen.getByTestId('tenant-picker-loading')).toBeDefined();
  });

  it('renders tenant options after loading', async () => {
    render(<TenantPicker />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('tenant-picker')).toBeDefined();
    });

    const select = screen.getByTestId('tenant-picker') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    // 1 placeholder + 2 tenants
    expect(options.length).toBe(3);
    expect(options[1]!.textContent).toBe('Alpha');
    expect(options[2]!.textContent).toBe('Beta');
  });

  it('calls switchTenant on selection change', async () => {
    render(<TenantPicker />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('tenant-picker')).toBeDefined();
    });

    const select = screen.getByTestId('tenant-picker') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 't2' } });

    await waitFor(() => expect(tm.switch).toHaveBeenCalledWith('t2'));
  });
});
