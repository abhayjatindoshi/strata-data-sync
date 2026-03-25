import type { BlobAdapter } from '@strata/adapter';
import { TENANTS_KEY } from '@strata/adapter';
import type { Tenant } from './types';

export async function loadTenantList(
  adapter: BlobAdapter,
): Promise<Tenant[]> {
  const data = await adapter.read(undefined, TENANTS_KEY);
  if (!data) return [];
  return data as Tenant[];
}

export async function saveTenantList(
  adapter: BlobAdapter,
  tenants: ReadonlyArray<Tenant>,
): Promise<void> {
  await adapter.write(undefined, TENANTS_KEY, tenants);
}
