import type { BlobAdapter, Tenant } from './types';
import type { PartitionBlob } from '@strata/persistence';
import { compositeKey } from '@strata/utils';

export class MemoryBlobAdapter implements BlobAdapter {
  readonly kind = 'blob' as const;
  private readonly store = new Map<string, PartitionBlob>();

  async read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null> {
    const data = this.store.get(compositeKey(tenant, key));
    return data !== undefined ? structuredClone(data) : null;
  }

  async write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void> {
    this.store.set(compositeKey(tenant, key), structuredClone(data));
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    return this.store.delete(compositeKey(tenant, key));
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const keyPrefix = tenant ? `${tenant.id}:` : '';
    const fullPrefix = `${keyPrefix}${prefix}`;
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(fullPrefix)) {
        keys.push(key.substring(keyPrefix.length));
      }
    }
    return keys;
  }
}
