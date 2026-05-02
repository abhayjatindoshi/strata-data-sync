import type { DataAdapter } from '@/persistence';
import type { ResolvedStrataOptions } from '../options';
import type { Tenant } from './types';
import { loadTenantList, saveTenantList } from './tenant-list';
import { log } from '@/log';

export function mergeTenantLists(
  local: ReadonlyArray<Tenant>,
  remote: ReadonlyArray<Tenant>,
): Tenant[] {
  const merged = new Map<string, Tenant>();

  for (const tenant of local) {
    merged.set(tenant.id, tenant);
  }

  for (const tenant of remote) {
    const existing = merged.get(tenant.id);
    if (!existing || new Date(tenant.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      merged.set(tenant.id, tenant);
    }
  }

  return Array.from(merged.values());
}

export async function pushTenantList(
  localAdapter: DataAdapter,
  cloudAdapter: DataAdapter,
  options: ResolvedStrataOptions,
): Promise<void> {
  const [local, remote] = await Promise.all([
    loadTenantList(localAdapter, options),
    loadTenantList(cloudAdapter, options),
  ]);
  const merged = mergeTenantLists(local, remote);
  await saveTenantList(cloudAdapter, merged, options);
  log.tenant('pushed tenant list (%d tenants)', merged.length);
}

export async function pullTenantList(
  localAdapter: DataAdapter,
  cloudAdapter: DataAdapter,
  options: ResolvedStrataOptions,
): Promise<void> {
  const local = await loadTenantList(localAdapter, options);
  const remote = await loadTenantList(cloudAdapter, options);
  const merged = mergeTenantLists(local, remote);
  await saveTenantList(localAdapter, merged, options);
  log.tenant('pulled tenant list (%d merged)', merged.length);
}
