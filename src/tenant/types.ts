import type { Observable } from 'rxjs';

export type Tenant = {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
  readonly cloudMeta: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateTenantInput = {
  readonly name: string;
  readonly cloudMeta: Readonly<Record<string, unknown>>;
  readonly id?: string;
  readonly icon?: string;
  readonly color?: string;
};

export type SetupInput = {
  readonly cloudMeta: Readonly<Record<string, unknown>>;
};

export type TenantManager = {
  readonly list: () => Promise<ReadonlyArray<Tenant>>;
  readonly create: (input: CreateTenantInput) => Promise<Tenant>;
  readonly setup: (input: SetupInput) => Promise<Tenant>;
  readonly load: (tenantId: string) => Promise<Tenant>;
  readonly delink: (tenantId: string) => Promise<void>;
  readonly delete: (tenantId: string) => Promise<void>;
  readonly activeTenant$: Observable<Tenant | null>;
  readonly dispose: () => void;
};
