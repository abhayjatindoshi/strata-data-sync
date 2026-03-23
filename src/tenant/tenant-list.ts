import type { BlobAdapter } from '@strata/adapter';
import { TENANTS_KEY } from '@strata/adapter';
import { serialize, deserialize } from '@strata/persistence';
import type { Tenant } from './types';

export async function loadTenantList(
  adapter: BlobAdapter,
): Promise<Tenant[]> {
  const data = await adapter.read(undefined, TENANTS_KEY);
  if (!data) return [];
  return deserialize<Tenant[]>(data);
}

export async function saveTenantList(
  adapter: BlobAdapter,
  tenants: ReadonlyArray<Tenant>,
): Promise<void> {
  const data = serialize(tenants);
  await adapter.write(undefined, TENANTS_KEY, data);
}
