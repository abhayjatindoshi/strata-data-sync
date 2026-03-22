import { BehaviorSubject } from 'rxjs';
import type { BlobAdapter } from '@strata/persistence';
import type { EntityStore } from '@strata/store';
import type { BaseTenant } from './tenant-entity';
import { TENANT_LIST_KEY } from './tenant-keys';
import { generateId } from '@strata/entity';
import { serialize } from '@strata/persistence';
import { deserialize } from '@strata/persistence';

export type TenantManager<TCustom = object> = {
  readonly list: () => Promise<ReadonlyArray<Readonly<BaseTenant & TCustom>>>;
  readonly create: (data: { name: string } & TCustom) => Promise<Readonly<BaseTenant & TCustom>>;
  readonly load: (tenantId: string) => Promise<void>;
  readonly switch: (tenantId: string) => Promise<void>;
  readonly activeTenant$: BehaviorSubject<Readonly<BaseTenant & TCustom> | undefined>;
};

export type TenantManagerOptions = {
  readonly store: EntityStore;
  readonly localAdapter: BlobAdapter;
  readonly deviceId: string;
};

export function createTenantManager<TCustom = object>(
  options: TenantManagerOptions,
): TenantManager<TCustom> {
  const { localAdapter, deviceId } = options;
  const activeTenant$ = new BehaviorSubject<Readonly<BaseTenant & TCustom> | undefined>(undefined);

  type Tenant = BaseTenant & TCustom;

  async function readTenantList(): Promise<Tenant[]> {
    const data = await localAdapter.read(TENANT_LIST_KEY);
    if (!data) return [];
    const json = new TextDecoder().decode(data);
    const blob = deserialize(json);
    const tenantsGroup = blob.entities['__tenants'];
    if (!tenantsGroup) return [];
    return Object.values(tenantsGroup) as Tenant[];
  }

  async function writeTenantList(tenants: readonly Tenant[]): Promise<void> {
    const group: Record<string, Record<string, unknown>> = {};
    for (const t of tenants) {
      group[t.id] = { ...t };
    }
    const json = serialize({ __tenants: group });
    const data = new TextEncoder().encode(json);
    await localAdapter.write(TENANT_LIST_KEY, data);
  }

  function clearStore(): void {
    const current = activeTenant$.getValue();
    if (!current) return;
    // Store clearing is handled externally by the caller on switch
  }

  return {
    activeTenant$,

    async list(): Promise<ReadonlyArray<Readonly<Tenant>>> {
      return readTenantList();
    },

    async create(data: { name: string } & TCustom): Promise<Readonly<Tenant>> {
      const now = new Date();
      const tenant: Tenant = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        version: 1,
        device: deviceId,
      } as Tenant;

      const existing = await readTenantList();
      existing.push(tenant);
      await writeTenantList(existing);

      return tenant;
    },

    async load(tenantId: string): Promise<void> {
      const tenants = await readTenantList();
      const tenant = tenants.find((t) => t.id === tenantId);
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      activeTenant$.next(tenant);
    },

    async switch(tenantId: string): Promise<void> {
      clearStore();
      const tenants = await readTenantList();
      const tenant = tenants.find((t) => t.id === tenantId);
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      activeTenant$.next(tenant);
    },
  };
}
