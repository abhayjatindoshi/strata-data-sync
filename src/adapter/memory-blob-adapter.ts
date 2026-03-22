import type { BlobAdapter, CloudMeta } from './types.js';

export class MemoryBlobAdapter implements BlobAdapter {
  private readonly store = new Map<string, Uint8Array>();

  async read(_cloudMeta: CloudMeta, path: string): Promise<Uint8Array | null> {
    return this.store.get(path) ?? null;
  }

  async write(_cloudMeta: CloudMeta, path: string, data: Uint8Array): Promise<void> {
    this.store.set(path, data);
  }

  async delete(_cloudMeta: CloudMeta, path: string): Promise<void> {
    this.store.delete(path);
  }

  async list(_cloudMeta: CloudMeta, prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter(key => key.startsWith(prefix));
  }
}
