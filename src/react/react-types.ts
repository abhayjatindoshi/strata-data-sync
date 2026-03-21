import type { ReactNode } from 'react';
import type { Strata } from '../strata/index.js';
import type { BaseTenant } from '../tenant/index.js';

export type StrataProviderProps = {
  readonly strata: Strata;
  readonly children: ReactNode;
};

export type TenantContextValue = {
  readonly activeTenant: Readonly<BaseTenant> | undefined;
  readonly tenants: ReadonlyArray<Readonly<BaseTenant>>;
  readonly switchTenant: (tenantId: string) => Promise<void>;
  readonly createTenant: (data: { readonly name: string }) => Promise<Readonly<BaseTenant>>;
  readonly loading: boolean;
};

export type TenantCreationWizardProps = {
  readonly onComplete?: (tenant: Readonly<BaseTenant>) => void;
  readonly onCancel?: () => void;
};
