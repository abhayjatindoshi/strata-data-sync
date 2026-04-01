import type { Tenant } from '@strata/adapter';
import type { BlobAdapter } from '@strata/adapter';
import type { PartitionBlob } from './types';
import { serialize, deserialize } from '@strata/utils';

export type DataAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null>;
  write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};

export async function readBlob(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  key: string,
): Promise<PartitionBlob | null> {
  const raw = await adapter.read(tenant, key);
  if (!raw) return null;
  return deserialize<PartitionBlob>(raw);
}

export async function writeBlob(
  adapter: BlobAdapter,
  tenant: Tenant | undefined,
  key: string,
  data: PartitionBlob,
): Promise<void> {
  const bytes = serialize(data);
  await adapter.write(tenant, key, bytes);
}

export function toDataAdapter(adapter: BlobAdapter): DataAdapter {
  return {
    read: (t, k) => readBlob(adapter, t, k),
    write: (t, k, d) => writeBlob(adapter, t, k, d),
    delete: (t, k) => adapter.delete(t, k),
    list: (t, p) => adapter.list(t, p),
  };
}
