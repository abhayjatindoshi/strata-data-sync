// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '@strata/strata';
import type { TenantManager } from '@strata/tenant';
import type { BaseTenant } from '@strata/tenant';
import { StrataProvider } from '@strata/react/strata-context';
import { TenantProvider } from '@strata/react/tenant-context';
import { TenantCreationWizard } from '@strata/react/tenant-creation-wizard';

function makeTenant(id: string, name: string): BaseTenant {
  return { id, name, createdAt: new Date(), updatedAt: new Date(), version: 1, device: 'test' };
}

function createWrapper(tm: TenantManager) {
  const strata: Strata = {
    repo: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    tenants: tm,
    sync: vi.fn(),
    dispose: vi.fn(),
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );
  };
}

describe('TenantCreationWizard', () => {
  it('renders name step initially', () => {
    const tm = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;

    render(<TenantCreationWizard />, { wrapper: createWrapper(tm) });
    expect(screen.getByTestId('wizard-name-step')).toBeDefined();
    expect(screen.getByTestId('wizard-name-input')).toBeDefined();
  });

  it('shows error when name is empty and Next is clicked', () => {
    const tm = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;

    render(<TenantCreationWizard />, { wrapper: createWrapper(tm) });

    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByTestId('wizard-error').textContent).toBe('Tenant name is required');
  });

  it('advances to confirm step after entering name', () => {
    const tm = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;

    render(<TenantCreationWizard />, { wrapper: createWrapper(tm) });

    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'My Tenant' } });
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByTestId('wizard-confirm')).toBeDefined();
  });

  it('goes back to name step from confirm', () => {
    const tm = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;

    render(<TenantCreationWizard />, { wrapper: createWrapper(tm) });

    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('wizard-name-step')).toBeDefined();
  });

  it('creates tenant on confirm and shows done step', async () => {
    const created = makeTenant('new-id', 'New Org');
    const onComplete = vi.fn();
    const tm = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(created),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;

    render(<TenantCreationWizard onComplete={onComplete} />, { wrapper: createWrapper(tm) });

    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'New Org' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByTestId('wizard-create'));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-done')).toBeDefined();
    });

    expect(tm.create).toHaveBeenCalledWith({ name: 'New Org' });
    expect(onComplete).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    const tm = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
    } as unknown as TenantManager;

    render(<TenantCreationWizard onCancel={onCancel} />, { wrapper: createWrapper(tm) });

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
