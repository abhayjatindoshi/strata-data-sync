import type { StorageAdapter, Tenant } from './types';

export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = 'storage' as const;
  private readonly store = new Map<string, Uint8Array>();

  private compositeKey(tenant: Tenant | undefined, key: string): string {
    return tenant ? `${tenant.id}:${key}` : key;
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    const data = this.store.get(this.compositeKey(tenant, key));
    return data !== undefined ? data.slice() : null;
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    this.store.set(this.compositeKey(tenant, key), data.slice());
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    return this.store.delete(this.compositeKey(tenant, key));
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
