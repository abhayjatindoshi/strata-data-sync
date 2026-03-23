import debug from 'debug';
import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { serialize, deserialize } from '@strata/persistence';

const log = debug('strata:tenant');

const TENANT_PREFS_KEY = '__tenant_prefs';

export type TenantPrefs = {
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
};

export async function saveTenantPrefs(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  prefs: TenantPrefs,
): Promise<void> {
  const data = serialize(prefs);
  await adapter.write(cloudMeta, TENANT_PREFS_KEY, data);
  log('saved tenant prefs');
}

export async function loadTenantPrefs(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
): Promise<TenantPrefs | undefined> {
  const data = await adapter.read(cloudMeta, TENANT_PREFS_KEY);
  if (!data) return undefined;
  return deserialize<TenantPrefs>(data);
}
