import type { StorageAdapter, Tenant } from './types';
import { compositeKey, toBase64, fromBase64 } from '@strata/utils';

export class LocalStorageAdapter implements StorageAdapter {

  constructor(private readonly prefix: string = 'strata') {
    if (typeof globalThis.localStorage === 'undefined') {
      throw new Error('LocalStorageAdapter requires a browser environment with localStorage');
    }
  }

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
    try {
      globalThis.localStorage.setItem(
        this.prefixedKey(compositeKey(tenant, key)),
        toBase64(data),
      );
    } catch (e) {
      throw new Error(`localStorage write failed for key "${key}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    const pk = this.prefixedKey(compositeKey(tenant, key));
    const existed = globalThis.localStorage.getItem(pk) !== null;
    globalThis.localStorage.removeItem(pk);
    return existed;
  }
}

