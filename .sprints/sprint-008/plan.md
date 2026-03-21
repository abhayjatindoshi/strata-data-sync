# Sprint 008

## Goal
Implement the React integration layer — context providers, hooks, HOCs, and UI components — completing the final framework module.

## Tasks

- [x] TASK-001: Create `src/react/` module scaffold with `index.ts` barrel and React-specific types (`ReactProviderProps`, `HookOptions`, etc.) [status: done]
- [x] TASK-002: Implement `StrataProvider` and `TenantProvider` React context providers that expose Strata and tenant instances to the component tree [status: done]
- [x] TASK-003: Implement `useRepo<T>` hook — provides typed repository access for a given entity definition, with reactive state via entity observables [status: done]
- [x] TASK-004: Implement `useTenant` hook — provides current tenant, tenant list, and tenant switching via the tenant manager [status: done]
- [x] TASK-005: Implement `withObservable` / `withCollection` HOCs that auto-subscribe to entity and collection observables and pass data as props [status: done]
- [x] TASK-006: Implement `TenantPicker` UI component — renders a selectable list of tenants, calls `tenantManager.switch()` on selection [status: done]
- [x] TASK-007: Implement `TenantCreationWizard` UI component — multi-step form for creating a new tenant via `tenantManager.create()` [status: done]
- [x] TASK-008: Write unit tests for all React module exports (providers, hooks, HOCs, UI components) using React Testing Library [status: done]

## Bugs Carried Over

_(none)_
