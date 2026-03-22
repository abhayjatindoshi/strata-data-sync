// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '@strata/strata';
import type { TenantManager } from '@strata/tenant';
import type { Repository } from '@strata/repository';
import { defineEntity } from '@strata/schema';
import { StrataProvider } from '@strata/react/strata-context';
import { useRepo } from '@strata/react/use-repo';

type Todo = { readonly title: string };

describe('useRepo', () => {
  it('returns repository from strata context', () => {
    const mockRepo = {
      get: vi.fn(),
      getAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      observe: vi.fn(),
      observeAll: vi.fn(),
    } as unknown as Repository<Todo>;

    const todoDef = defineEntity<Todo>('todo');

    const strata: Strata = {
      repo: vi.fn().mockReturnValue(mockRepo),
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
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>{children}</StrataProvider>
    );

    const { result } = renderHook(() => useRepo(todoDef), { wrapper });

    expect(strata.repo).toHaveBeenCalledWith(todoDef);
    expect(result.current).toBe(mockRepo);
  });

  it('memoizes the repository for the same def', () => {
    const mockRepo = { get: vi.fn() } as unknown as Repository<Todo>;
    const todoDef = defineEntity<Todo>('todo');

    const strata: Strata = {
      repo: vi.fn().mockReturnValue(mockRepo),
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
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>{children}</StrataProvider>
    );

    const { result, rerender } = renderHook(() => useRepo(todoDef), { wrapper });
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(strata.repo).toHaveBeenCalledTimes(1);
  });
});
