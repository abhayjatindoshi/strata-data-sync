import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import type { PartitionBlob } from '@strata/persistence';

const log = debug('strata:tenant');

const TENANT_PREFS_KEY = '__tenant_prefs';
const PREFS_ENTITY_KEY = '__prefs';

export type TenantPrefs = {
  readonly name: string;
};

export async function saveTenantPrefs(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  prefs: TenantPrefs,
): Promise<void> {
  const blob: PartitionBlob = {
    [PREFS_ENTITY_KEY]: { prefs },
    deleted: {},
  };
  await adapter.write(tenant, TENANT_PREFS_KEY, blob);
  log('saved tenant prefs');
}

export async function loadTenantPrefs(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
): Promise<TenantPrefs | undefined> {
  const blob = await adapter.read(tenant, TENANT_PREFS_KEY);
  if (!blob) return undefined;
  const prefsEntities = blob[PREFS_ENTITY_KEY] as Record<string, unknown> | undefined;
  if (!prefsEntities) return undefined;
  return prefsEntities['prefs'] as TenantPrefs | undefined;
}
