import type { BlobAdapter } from '@strata/adapter';
import type { PartitionBlob } from '@strata/persistence';
import type { ResolvedStrataOptions } from '../options';
import type { Tenant } from './types';

const TENANTS_ENTITY_KEY = '__tenants';

export async function loadTenantList(
  adapter: BlobAdapter,
  options: ResolvedStrataOptions,
): Promise<Tenant[]> {
  const blob = await adapter.read(undefined, options.tenantKey);
  if (!blob) return [];
  const tenantEntities = blob[TENANTS_ENTITY_KEY] as Record<string, unknown> | undefined;
  if (!tenantEntities) return [];
  return Object.values(tenantEntities) as Tenant[];
}

export async function saveTenantList(
  adapter: BlobAdapter,
  tenants: ReadonlyArray<Tenant>,
  options: ResolvedStrataOptions,
): Promise<void> {
  const tenantEntities: Record<string, unknown> = {};
  for (const tenant of tenants) {
    tenantEntities[tenant.id] = tenant;
  }
  const blob: PartitionBlob = {
    [TENANTS_ENTITY_KEY]: tenantEntities,
    deleted: {},
  };
  await adapter.write(undefined, options.tenantKey, blob);
}
