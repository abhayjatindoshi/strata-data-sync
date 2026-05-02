import type { Tenant } from '@/adapter';
import type { PartitionBlob, DataAdapter } from '@/persistence';
import { log } from '@/log';

const TENANT_PREFS_KEY = '__tenant_prefs';
const PREFS_ENTITY_KEY = '__prefs';

export type TenantPrefs = {
  readonly name: string;
};

export async function saveTenantPrefs(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  prefs: TenantPrefs,
): Promise<void> {
  const blob: PartitionBlob = {
    [PREFS_ENTITY_KEY]: { prefs },
    deleted: {},
  };
  await adapter.write(tenant, TENANT_PREFS_KEY, blob);
  log.tenant('saved tenant prefs');
}

export async function loadTenantPrefs(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
): Promise<TenantPrefs | undefined> {
  const blob = await adapter.read(tenant, TENANT_PREFS_KEY);
  if (!blob) return undefined;
  const prefsEntities = blob[PREFS_ENTITY_KEY] as Record<string, unknown> | undefined;
  if (!prefsEntities) return undefined;
  return prefsEntities['prefs'] as TenantPrefs | undefined;
}
