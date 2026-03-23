import { BehaviorSubject } from 'rxjs';
import type { BlobAdapter } from '@strata/adapter';
import type { Tenant, CreateTenantInput, SetupInput, TenantManager } from './types.js';
import { deriveTenantId } from './derive-tenant-id.js';
import {
  readTenantList,
  writeTenantList,
  unionMergeTenantLists,
  writeMarkerBlob,
  readMarkerBlob,
} from './tenant-storage.js';

export function createTenantManager(
  localAdapter: BlobAdapter,
  cloudAdapter: BlobAdapter,
): TenantManager {
  const activeTenantSubject = new BehaviorSubject<Tenant | null>(null);

  async function list(): Promise<ReadonlyArray<Tenant>> {
    return readTenantList(localAdapter, undefined);
  }

  async function create(input: CreateTenantInput): Promise<Tenant> {
    const now = new Date();
    const id = input.id ?? deriveTenantId(input.cloudMeta);
    const tenant: Tenant = {
      id,
      name: input.name,
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      cloudMeta: input.cloudMeta,
      createdAt: now,
      updatedAt: now,
    };

    const tenants = await readTenantList(localAdapter, undefined);
    const updated = [...tenants, tenant];
    await writeTenantList(localAdapter, undefined, updated);

    // Cloud backup + marker
    try {
      await writeTenantList(cloudAdapter, input.cloudMeta, updated);
      await writeMarkerBlob(cloudAdapter, input.cloudMeta);
    } catch {
      // Cloud write is best-effort
    }

    return tenant;
  }

  async function setup(input: SetupInput): Promise<Tenant> {
    const hasMarker = await readMarkerBlob(cloudAdapter, input.cloudMeta);
    if (!hasMarker) {
      throw new Error('No strata marker found at cloud location');
    }

    // Read cloud tenant list and merge with local
    const cloudTenants = await readTenantList(cloudAdapter, input.cloudMeta);
    const localTenants = await readTenantList(localAdapter, undefined);
    const merged = unionMergeTenantLists(localTenants, cloudTenants);
    await writeTenantList(localAdapter, undefined, merged);

    // Find tenant matching this cloudMeta
    const tenantId = deriveTenantId(input.cloudMeta);
    const found = merged.find(t => t.id === tenantId);
    if (!found) {
      throw new Error('Tenant not found for given cloudMeta');
    }
    return found;
  }

  async function load(tenantId: string): Promise<Tenant> {
    const tenants = await readTenantList(localAdapter, undefined);
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    activeTenantSubject.next(tenant);
    return tenant;
  }

  async function delink(tenantId: string): Promise<void> {
    const tenants = await readTenantList(localAdapter, undefined);
    const filtered = tenants.filter(t => t.id !== tenantId);
    await writeTenantList(localAdapter, undefined, filtered);
    if (activeTenantSubject.value?.id === tenantId) {
      activeTenantSubject.next(null);
    }
  }

  async function del(tenantId: string): Promise<void> {
    const tenants = await readTenantList(localAdapter, undefined);
    const tenant = tenants.find(t => t.id === tenantId);
    const filtered = tenants.filter(t => t.id !== tenantId);
    await writeTenantList(localAdapter, undefined, filtered);

    // Destroy cloud data
    if (tenant) {
      try {
        const blobs = await cloudAdapter.list(tenant.cloudMeta, '');
        for (const path of blobs) {
          await cloudAdapter.delete(tenant.cloudMeta, path);
        }
      } catch {
        // Best-effort
      }
    }

    if (activeTenantSubject.value?.id === tenantId) {
      activeTenantSubject.next(null);
    }
  }

  function dispose(): void {
    activeTenantSubject.complete();
  }

  return {
    list,
    create,
    setup,
    load,
    delink,
    delete: del,
    activeTenant$: activeTenantSubject.asObservable(),
    dispose,
  };
}
