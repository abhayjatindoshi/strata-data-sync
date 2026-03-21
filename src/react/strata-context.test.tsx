// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, renderHook, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '../strata/index.js';
import type { TenantManager } from '../tenant/index.js';
import { StrataProvider, useStrataContext } from './strata-context.js';

function createMockStrata(overrides?: Partial<Strata>): Strata {
  return {
    repo: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    tenants: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      load: vi.fn(),
      switch: vi.fn(),
      activeTenant$: new BehaviorSubject(undefined),
    } as unknown as TenantManager,
    sync: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe('StrataProvider', () => {
  it('renders children', () => {
    const strata = createMockStrata();
    render(
      <StrataProvider strata={strata}>
        <div data-testid="child">Hello</div>
      </StrataProvider>,
    );
    expect(screen.getByTestId('child').textContent).toBe('Hello');
  });

  it('provides strata instance to descendants', () => {
    const strata = createMockStrata();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>{children}</StrataProvider>
    );

    const { result } = renderHook(() => useStrataContext(), { wrapper });
    expect(result.current).toBe(strata);
  });
});

describe('useStrataContext', () => {
  it('throws when used outside StrataProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useStrataContext())).toThrow(
      'useStrataContext must be used within a StrataProvider',
    );
    spy.mockRestore();
  });
});
