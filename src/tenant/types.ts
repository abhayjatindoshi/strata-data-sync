import type { Observable } from 'rxjs';
import type { SyncResult } from '@/sync';

export type Tenant = {
  readonly id: string;
  readonly name: string;
  readonly encrypted: boolean;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ProbeResult =
  | { readonly exists: false }
  | { readonly exists: true; readonly encrypted: false; readonly tenantId: string }
  | { readonly exists: true; readonly encrypted: true; readonly tenantId: string };

export type CreateTenantOptions = {
  readonly name: string;
  readonly meta: Record<string, unknown>;
  readonly id?: string;
  readonly encryption?: { readonly credential: string };
};

export type JoinTenantOptions = {
  readonly meta: Record<string, unknown>;
  readonly name?: string;
};

export type TenantManager = {
  list(): Promise<ReadonlyArray<Tenant>>;
  probe(ref: { meta: Record<string, unknown> }): Promise<ProbeResult>;
  create(opts: CreateTenantOptions): Promise<Tenant>;
  join(opts: JoinTenantOptions): Promise<Tenant>;
  remove(tenantId: string, opts?: { purge?: boolean }): Promise<void>;
  open(tenantId: string, opts?: { credential?: string }): Promise<void>;
  close(): Promise<void>;
  sync(): Promise<SyncResult>;
  changeCredential(oldCredential: string, newCredential: string): Promise<void>;
  readonly activeTenant$: Observable<Tenant | undefined>;
  readonly activeTenant: Tenant | undefined;
};
