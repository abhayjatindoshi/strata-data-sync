import type { StorageAdapter, Tenant } from './types';
import { compositeKey } from '@strata/utils';

export class MemoryStorageAdapter implements StorageAdapter {
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
}



