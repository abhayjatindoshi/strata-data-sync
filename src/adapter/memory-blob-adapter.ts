import type { BlobAdapter, Tenant } from './types';

export class MemoryBlobAdapter implements BlobAdapter {
  private readonly store = new Map<string, unknown>();

  private compositeKey(tenant: Tenant | undefined, key: string): string {
    return tenant ? `${tenant.id}:${key}` : key;
  }

  async read(tenant: Tenant | undefined, key: string): Promise<unknown> {
    const data = this.store.get(this.compositeKey(tenant, key));
    return data !== undefined ? structuredClone(data) : null;
  }

  async write(tenant: Tenant | undefined, key: string, data: unknown): Promise<void> {
    this.store.set(this.compositeKey(tenant, key), structuredClone(data));
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

export function createMemoryBlobAdapter(): BlobAdapter {
  return new MemoryBlobAdapter();
}
