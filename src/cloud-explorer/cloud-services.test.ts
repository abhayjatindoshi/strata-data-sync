import { describe, it, expect } from 'vitest';
import type { CloudFileService, CloudObjectService } from './cloud-services.js';

describe('CloudFileService contract', () => {
  it('accepts a valid CloudFileService implementation', async () => {
    const store = new Map<string, Uint8Array>();

    const service: CloudFileService = {
      listFiles: async () => [],
      readFile: async (fileId) => store.get(fileId) ?? new Uint8Array(),
      writeFile: async (folderId, name, data) => {
        const id = `${folderId}/${name}`;
        store.set(id, data);
        return id;
      },
      deleteFile: async (fileId) => { store.delete(fileId); },
      createFolder: async (_parentId, name) => name,
    };

    const id = await service.writeFile('root', 'test.txt', new Uint8Array([1, 2, 3]));
    expect(id).toBe('root/test.txt');

    const data = await service.readFile(id);
    expect(data).toEqual(new Uint8Array([1, 2, 3]));

    const files = await service.listFiles('root');
    expect(files).toEqual([]);

    await service.deleteFile(id);
    const after = await service.readFile(id);
    expect(after).toEqual(new Uint8Array());
  });
});

describe('CloudObjectService contract', () => {
  it('accepts a valid CloudObjectService implementation', async () => {
    const store = new Map<string, Uint8Array>();

    const service: CloudObjectService = {
      listObjects: async (prefix) => {
        const result: { key: string; size: number }[] = [];
        for (const [key, val] of store) {
          if (key.startsWith(prefix)) result.push({ key, size: val.length });
        }
        return result;
      },
      getObject: async (key) => store.get(key) ?? new Uint8Array(),
      putObject: async (key, data) => { store.set(key, data); },
      deleteObject: async (key) => { store.delete(key); },
    };

    await service.putObject('data/file1.bin', new Uint8Array([10, 20]));
    const obj = await service.getObject('data/file1.bin');
    expect(obj).toEqual(new Uint8Array([10, 20]));

    const list = await service.listObjects('data/');
    expect(list).toHaveLength(1);
    expect(list[0]!.key).toBe('data/file1.bin');

    await service.deleteObject('data/file1.bin');
    const afterList = await service.listObjects('data/');
    expect(afterList).toHaveLength(0);
  });
});
