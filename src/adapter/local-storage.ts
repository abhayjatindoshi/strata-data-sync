import type { StorageAdapter, Tenant } from './types';

function compositeKey(tenant: Tenant | undefined, key: string): string {
  return tenant ? `${tenant.id}:${key}` : key;
}

function toBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'storage' as const;

  constructor(private readonly prefix: string = 'strata') {}

  private prefixedKey(compositeKey: string): string {
    return `${this.prefix}:${compositeKey}`;
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    const stored = globalThis.localStorage.getItem(
      this.prefixedKey(compositeKey(tenant, key)),
    );
    if (stored === null) return null;
    return fromBase64(stored);
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    globalThis.localStorage.setItem(
      this.prefixedKey(compositeKey(tenant, key)),
      toBase64(data),
    );
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    const pk = this.prefixedKey(compositeKey(tenant, key));
    const existed = globalThis.localStorage.getItem(pk) !== null;
    globalThis.localStorage.removeItem(pk);
    return existed;
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const ck = compositeKey(tenant, prefix);
    const pk = this.prefixedKey(ck);
    const tenantPrefix = tenant ? `${tenant.id}:` : '';
    const fullTenantPrefix = this.prefixedKey(tenantPrefix);
    const keys: string[] = [];

    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const storageKey = globalThis.localStorage.key(i);
      if (storageKey && storageKey.startsWith(pk)) {
        // Strip the prefix and tenant prefix to return the bare key
        keys.push(storageKey.substring(fullTenantPrefix.length));
      }
    }
    return keys;
  }
}
