import type { BehaviorSubject } from 'rxjs';

export type Tenant = {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
export type CreateTenantOptions = {
  readonly name: string;
  readonly meta: Record<string, unknown>;
  readonly id?: string;
};

export type SetupTenantOptions = {
  readonly meta: Record<string, unknown>;
  readonly name?: string;
};

export type TenantManagerOptions = {
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
  readonly entityTypes?: readonly string[];
};

export type TenantManager = {
  list(): Promise<ReadonlyArray<Tenant>>;
  create(opts: CreateTenantOptions): Promise<Tenant>;
  setup(opts: SetupTenantOptions): Promise<Tenant>;
  load(tenantId: string): Promise<void>;
  delink(tenantId: string): Promise<void>;
  delete(tenantId: string): Promise<void>;
  readonly activeTenant$: BehaviorSubject<Tenant | undefined>;
};
