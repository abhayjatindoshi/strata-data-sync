import debug from 'debug';
import type { BlobAdapter, Meta } from '@strata/adapter';
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
  meta: Meta,
  prefs: TenantPrefs,
): Promise<void> {
  const data = serialize(prefs);
  await adapter.write(meta, TENANT_PREFS_KEY, data);
  log('saved tenant prefs');
}

export async function loadTenantPrefs(
  adapter: BlobAdapter,
  meta: Meta,
): Promise<TenantPrefs | undefined> {
  const data = await adapter.read(meta, TENANT_PREFS_KEY);
  if (!data) return undefined;
  return deserialize<TenantPrefs>(data);
}
