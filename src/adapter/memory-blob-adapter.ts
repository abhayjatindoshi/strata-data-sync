import type { BlobAdapter, CloudMeta } from './types';

export class MemoryBlobAdapter implements BlobAdapter {
  private readonly store = new Map<string, Uint8Array>();

  async read(_cloudMeta: CloudMeta, key: string): Promise<Uint8Array | null> {
    const data = this.store.get(key);
    return data ? new Uint8Array(data) : null;
  }

  async write(_cloudMeta: CloudMeta, key: string, data: Uint8Array): Promise<void> {
    this.store.set(key, new Uint8Array(data));
  }

  async delete(_cloudMeta: CloudMeta, key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async list(_cloudMeta: CloudMeta, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }
}

export function createMemoryBlobAdapter(): BlobAdapter {
  return new MemoryBlobAdapter();
}
