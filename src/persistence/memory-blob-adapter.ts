import type { BlobAdapter } from './blob-adapter.js';

export function createMemoryBlobAdapter(): BlobAdapter {
  const storage = new Map<string, Uint8Array>();

  return {
    async read(key) {
      return storage.get(key) ?? null;
    },
    async write(key, data) {
      storage.set(key, new Uint8Array(data));
    },
    async delete(key) {
      storage.delete(key);
    },
    async list(prefix) {
      const results: string[] = [];
      for (const key of storage.keys()) {
        if (key.startsWith(prefix)) {
          results.push(key);
        }
      }
      return results;
    },
  };
}
