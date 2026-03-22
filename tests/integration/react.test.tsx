// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, renderHook, act, waitFor, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Strata } from '@strata/strata';
import type { TenantManager, BaseTenant } from '@strata/tenant';
import type { Repository } from '@strata/repository';
import { defineEntity } from '@strata/schema';
import { StrataProvider } from '@strata/react/strata-context';
import { TenantProvider } from '@strata/react/tenant-context';
import { useRepo } from '@strata/react/use-repo';
import { useTenant } from '@strata/react/use-tenant';
import { withObservable } from '@strata/react/with-observable';
import { withCollection } from '@strata/react/with-collection';
import { TenantPicker } from '@strata/react/tenant-picker';
import { TenantCreationWizard } from '@strata/react/tenant-creation-wizard';

// ── Types ───────────────────────────────────────────────────────────
type Todo = { readonly title: string; readonly done: boolean };

const TodoDef = defineEntity<Todo>('Todo');

// ── Test helpers ────────────────────────────────────────────────────
function makeTenant(id: string, name: string): BaseTenant {
  return { id, name, createdAt: new Date(), updatedAt: new Date(), version: 1, device: 'test' };
}

function createMockTenantManager(tenants: BaseTenant[] = []): TenantManager {
  return {
    list: vi.fn().mockResolvedValue(tenants),
    create: vi.fn(),
    load: vi.fn(),
    switch: vi.fn().mockResolvedValue(undefined),
    activeTenant$: new BehaviorSubject<BaseTenant | undefined>(undefined),
  } as unknown as TenantManager;
}

function createMockStrata(overrides?: Partial<Strata>): Strata {
  return {
    repo: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    tenants: createMockTenantManager(),
    sync: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createMockRepo(): Repository<Todo> {
  return {
    get: vi.fn(),
    getAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    observe: vi.fn(),
    observeAll: vi.fn(),
  } as unknown as Repository<Todo>;
}

afterEach(cleanup);

// ═══════════════════════════════════════════════════════════════════
// 1. StrataProvider
// ═══════════════════════════════════════════════════════════════════
describe('StrataProvider', () => {
  it('renders children within the provider', () => {
    const strata = createMockStrata();
    render(
      <StrataProvider strata={strata}>
        <div data-testid="app-root">Strata App</div>
      </StrataProvider>,
    );
    expect(screen.getByTestId('app-root').textContent).toBe('Strata App');
  });

  it('provides Strata context to nested consumers', () => {
    const mockRepo = createMockRepo();
    const strata = createMockStrata({ repo: vi.fn().mockReturnValue(mockRepo) });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>{children}</StrataProvider>
    );

    const { result } = renderHook(() => useRepo(TodoDef), { wrapper });
    expect(strata.repo).toHaveBeenCalledWith(TodoDef);
    expect(result.current).toBe(mockRepo);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. useRepo
// ═══════════════════════════════════════════════════════════════════
describe('useRepo', () => {
  it('returns a typed repository from the Strata context', () => {
    const mockRepo = createMockRepo();
    const strata = createMockStrata({ repo: vi.fn().mockReturnValue(mockRepo) });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>{children}</StrataProvider>
    );

    const { result } = renderHook(() => useRepo(TodoDef), { wrapper });
    expect(result.current.get).toBeTypeOf('function');
    expect(result.current.save).toBeTypeOf('function');
    expect(result.current.delete).toBeTypeOf('function');
    expect(result.current.observe).toBeTypeOf('function');
    expect(result.current.observeAll).toBeTypeOf('function');
    expect(result.current.getAll).toBeTypeOf('function');
  });

  it('memoizes the repository across re-renders', () => {
    const mockRepo = createMockRepo();
    const repoFn = vi.fn().mockReturnValue(mockRepo);
    const strata = createMockStrata({ repo: repoFn });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>{children}</StrataProvider>
    );

    const { result, rerender } = renderHook(() => useRepo(TodoDef), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. useTenant
// ═══════════════════════════════════════════════════════════════════
describe('useTenant', () => {
  it('provides active tenant and tenant list from context', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const tm = createMockTenantManager([tenantA]);
    (tm.activeTenant$ as BehaviorSubject<BaseTenant | undefined>).next(tenantA);
    const strata = createMockStrata({ tenants: tm });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );

    const { result } = renderHook(() => useTenant(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeTenant?.id).toBe('t1');
    expect(result.current.tenants).toHaveLength(1);
  });

  it('triggers tenant switch via switchTenant', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const tenantB = makeTenant('t2', 'Beta');
    const tm = createMockTenantManager([tenantA, tenantB]);
    const strata = createMockStrata({ tenants: tm });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrataProvider strata={strata}>
        <TenantProvider>{children}</TenantProvider>
      </StrataProvider>
    );

    const { result } = renderHook(() => useTenant(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.switchTenant('t2');
    });

    expect(tm.switch).toHaveBeenCalledWith('t2');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. withObservable HOC
// ═══════════════════════════════════════════════════════════════════
describe('withObservable HOC', () => {
  it('renders entity data from a BehaviorSubject', () => {
    const todo: Todo = { title: 'Buy milk', done: false };
    const subject = new BehaviorSubject<Todo | undefined>(todo);

    function TodoCard({ data }: { readonly data: Todo | undefined }) {
      if (!data) return <div>No data</div>;
      return <div data-testid="todo-title">{data.title}</div>;
    }

    const EnhancedTodoCard = withObservable<Todo>(TodoCard, () => subject);
    render(<EnhancedTodoCard />);

    expect(screen.getByTestId('todo-title').textContent).toBe('Buy milk');
  });

  it('updates when the observable emits a new value', () => {
    const subject = new BehaviorSubject<Todo | undefined>({ title: 'Old', done: false });

    function TodoCard({ data }: { readonly data: Todo | undefined }) {
      return <div data-testid="todo-title">{data?.title ?? 'none'}</div>;
    }

    const Enhanced = withObservable<Todo>(TodoCard, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('todo-title').textContent).toBe('Old');

    act(() => { subject.next({ title: 'New', done: true }); });

    expect(screen.getByTestId('todo-title').textContent).toBe('New');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. withCollection HOC
// ═══════════════════════════════════════════════════════════════════
describe('withCollection HOC', () => {
  it('renders a list of entities from a BehaviorSubject', () => {
    const todos: ReadonlyArray<Todo> = [
      { title: 'A', done: false },
      { title: 'B', done: true },
    ];
    const subject = new BehaviorSubject<ReadonlyArray<Todo>>(todos);

    function TodoList({ data }: { readonly data: ReadonlyArray<Todo> }) {
      return (
        <ul data-testid="todo-list">
          {data.map((t) => <li key={t.title}>{t.title}</li>)}
        </ul>
      );
    }

    const Enhanced = withCollection<Todo>(TodoList, () => subject);
    render(<Enhanced />);

    const list = screen.getByTestId('todo-list');
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  it('updates when the collection observable emits new items', () => {
    const subject = new BehaviorSubject<ReadonlyArray<Todo>>([]);

    function TodoList({ data }: { readonly data: ReadonlyArray<Todo> }) {
      return <div data-testid="count">{data.length}</div>;
    }

    const Enhanced = withCollection<Todo>(TodoList, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('count').textContent).toBe('0');

    act(() => { subject.next([{ title: 'X', done: false }, { title: 'Y', done: true }]); });

    expect(screen.getByTestId('count').textContent).toBe('2');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. TenantPicker
// ═══════════════════════════════════════════════════════════════════
describe('TenantPicker', () => {
  it('renders tenant list as a select dropdown', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const tenantB = makeTenant('t2', 'Beta');
    const tm = createMockTenantManager([tenantA, tenantB]);
    const strata = createMockStrata({ tenants: tm });

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TenantPicker />
        </TenantProvider>
      </StrataProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tenant-picker')).toBeDefined();
    });

    const select = screen.getByTestId('tenant-picker') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3);
    expect(options[1]!.textContent).toBe('Alpha');
    expect(options[2]!.textContent).toBe('Beta');
  });

  it('calls switchTenant when a tenant is selected', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const tenantB = makeTenant('t2', 'Beta');
    const tm = createMockTenantManager([tenantA, tenantB]);
    const strata = createMockStrata({ tenants: tm });

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TenantPicker />
        </TenantProvider>
      </StrataProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tenant-picker')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('tenant-picker'), { target: { value: 't2' } });

    await waitFor(() => {
      expect(tm.switch).toHaveBeenCalledWith('t2');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. TenantCreationWizard
// ═══════════════════════════════════════════════════════════════════
describe('TenantCreationWizard', () => {
  it('renders the name input form initially', () => {
    const tm = createMockTenantManager();
    const strata = createMockStrata({ tenants: tm });

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TenantCreationWizard />
        </TenantProvider>
      </StrataProvider>,
    );

    expect(screen.getByTestId('wizard-name-step')).toBeDefined();
    expect(screen.getByTestId('wizard-name-input')).toBeDefined();
  });

  it('creates a tenant through the full wizard flow', async () => {
    const created = makeTenant('new-id', 'New Org');
    const onComplete = vi.fn();
    const tm = createMockTenantManager();
    (tm.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const strata = createMockStrata({ tenants: tm });

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TenantCreationWizard onComplete={onComplete} />
        </TenantProvider>
      </StrataProvider>,
    );

    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'New Org' } });
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByTestId('wizard-confirm')).toBeDefined();
    fireEvent.click(screen.getByTestId('wizard-create'));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-done')).toBeDefined();
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows validation error for empty name', () => {
    const tm = createMockTenantManager();
    const strata = createMockStrata({ tenants: tm });

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TenantCreationWizard />
        </TenantProvider>
      </StrataProvider>,
    );

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByTestId('wizard-error').textContent).toBe('Tenant name is required');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. End-to-end React flow
// ═══════════════════════════════════════════════════════════════════
describe('End-to-end React flow', () => {
  it('renders a component tree with StrataProvider → TenantProvider → useRepo, saves an entity and observes UI updates', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const todoSubject = new BehaviorSubject<ReadonlyArray<Todo>>([]);

    const mockRepo: Repository<Todo> = {
      get: vi.fn(),
      getAll: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockImplementation(async (entity: Todo) => {
        const current = todoSubject.getValue();
        todoSubject.next([...current, entity]);
        return 'generated-id';
      }),
      delete: vi.fn(),
      observe: vi.fn(),
      observeAll: vi.fn().mockReturnValue(todoSubject),
    };

    const tm = createMockTenantManager([tenantA]);
    (tm.activeTenant$ as BehaviorSubject<BaseTenant | undefined>).next(tenantA);

    const strata = createMockStrata({
      tenants: tm,
      repo: vi.fn().mockReturnValue(mockRepo),
    });

    function TodoApp() {
      const repo = useRepo(TodoDef);
      const subject = repo.observeAll();

      function TodoListView({ data }: { readonly data: ReadonlyArray<Todo> }) {
        return (
          <div>
            <div data-testid="todo-count">{data.length}</div>
            <ul data-testid="todo-items">
              {data.map((t, i) => <li key={i}>{t.title}</li>)}
            </ul>
          </div>
        );
      }

      const EnhancedList = withCollection<Todo>(TodoListView, () => subject as unknown as BehaviorSubject<ReadonlyArray<Todo>>);

      return (
        <div>
          <EnhancedList />
          <button
            data-testid="add-todo"
            onClick={() => void repo.save({ title: 'New Todo', done: false })}
          >
            Add
          </button>
        </div>
      );
    }

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TodoApp />
        </TenantProvider>
      </StrataProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('todo-count').textContent).toBe('0');
    });

    fireEvent.click(screen.getByTestId('add-todo'));

    await waitFor(() => {
      expect(screen.getByTestId('todo-count').textContent).toBe('1');
    });

    const items = screen.getByTestId('todo-items').querySelectorAll('li');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toBe('New Todo');

    act(() => {
      todoSubject.next([
        { title: 'New Todo', done: false },
        { title: 'Second Todo', done: true },
      ]);
    });

    expect(screen.getByTestId('todo-count').textContent).toBe('2');
  });

  it('combines TenantPicker and TenantCreationWizard in a full app shell', async () => {
    const tenantA = makeTenant('t1', 'Alpha');
    const created = makeTenant('t2', 'New Tenant');
    const tm = createMockTenantManager([tenantA]);
    (tm.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    (tm.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([tenantA])
      .mockResolvedValueOnce([tenantA, created]);

    const strata = createMockStrata({ tenants: tm });

    render(
      <StrataProvider strata={strata}>
        <TenantProvider>
          <TenantPicker />
          <TenantCreationWizard />
        </TenantProvider>
      </StrataProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tenant-picker')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'New Tenant' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByTestId('wizard-create'));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-done')).toBeDefined();
    });
  });
});
