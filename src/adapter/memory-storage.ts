import type { BlobAdapter, Tenant } from './types';
import { compositeKey } from '@strata/utils';

export class MemoryBlobAdapter implements BlobAdapter {
  private readonly store = new Map<string, Uint8Array>();

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    const data = this.store.get(compositeKey(tenant, key));
    return data !== undefined ? data.slice() : null;
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    this.store.set(compositeKey(tenant, key), data.slice());
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
