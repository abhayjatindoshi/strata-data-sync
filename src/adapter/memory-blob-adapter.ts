import type { BlobAdapter } from './types';

export function createMemoryBlobAdapter(): BlobAdapter {
  const store = new Map<string, Uint8Array>();

  return {
    async read(_cloudMeta, key) {
      const data = store.get(key);
      return data ? new Uint8Array(data) : null;
    },
    async write(_cloudMeta, key, data) {
      store.set(key, new Uint8Array(data));
    },
    async delete(_cloudMeta, key) {
      return store.delete(key);
    },
    async list(_cloudMeta, prefix) {
      const keys: string[] = [];
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    },
  };
}
