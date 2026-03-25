import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';

const log = debug('strata:tenant');

const TENANT_PREFS_KEY = '__tenant_prefs';

export type TenantPrefs = {
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
};

export async function saveTenantPrefs(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  prefs: TenantPrefs,
): Promise<void> {
  await adapter.write(tenant, TENANT_PREFS_KEY, prefs);
  log('saved tenant prefs');
}

export async function loadTenantPrefs(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<TenantPrefs | undefined> {
  const data = await adapter.read(tenant, TENANT_PREFS_KEY);
  if (!data) return undefined;
  return data as TenantPrefs;
}
