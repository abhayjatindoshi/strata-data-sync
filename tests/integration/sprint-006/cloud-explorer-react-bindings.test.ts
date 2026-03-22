import { describe, it, expect } from 'vitest';
import type {
  ExplorerItem,
  ExplorerCapabilities,
  ExplorerDataSource,
  CloudFileService,
  CloudObjectService,
  CloudExplorerProps,
} from '../../../src/cloud-explorer/index.js';
import { createExplorerSource } from '../../../src/cloud-explorer/index.js';
import type { Tenant } from '../../../src/tenant/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTenant(id: string, cloudMeta: Record<string, unknown>): Tenant {
  return { id, name: `Tenant ${id}`, cloudMeta, createdAt: new Date(), updatedAt: new Date() };
}

function makeItem(id: string, name: string, type: 'container' | 'item', path: string): ExplorerItem {
  return { id, name, type, path };
}

function makeMockDataSource(
  spaces: ExplorerItem[] = [],
  itemsByParent: Record<string, ExplorerItem[]> = {},
  caps: ExplorerCapabilities = { canCreateContainer: true, canSelect: true },
): ExplorerDataSource {
  return {
    getSpaces: async () => spaces,
    getItems: async (parentId) => itemsByParent[parentId] ?? [],
    createContainer: async (_parentId, name) => ({
      id: `created-${name}`,
      name,
      type: 'container' as const,
      path: `/${name}`,
    }),
    capabilities: caps,
  };
}

// ---------------------------------------------------------------------------
// 1. ExplorerDataSource contract
// ---------------------------------------------------------------------------

describe('ExplorerDataSource contract', () => {
  it('getSpaces returns an array of ExplorerItem', async () => {
    const spaces = [
      makeItem('s1', 'Space A', 'container', '/a'),
      makeItem('s2', 'Space B', 'container', '/b'),
    ];
    const ds = makeMockDataSource(spaces);
    const result = await ds.getSpaces();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ id: 's1', type: 'container' }));
    expect(result[1]).toEqual(expect.objectContaining({ id: 's2', name: 'Space B' }));
  });

  it('getItems returns items for a given parentId', async () => {
    const items = [makeItem('f1', 'File 1', 'item', '/a/f1')];
    const ds = makeMockDataSource([], { 'parent-1': items });

    const result = await ds.getItems('parent-1');
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('item');
  });

  it('getItems returns empty array for unknown parent', async () => {
    const ds = makeMockDataSource();
    const result = await ds.getItems('nonexistent');
    expect(result).toEqual([]);
  });

  it('createContainer returns a new container ExplorerItem', async () => {
    const ds = makeMockDataSource();
    const created = await ds.createContainer('root', 'new-folder');

    expect(created.type).toBe('container');
    expect(created.name).toBe('new-folder');
    expect(created.id).toBeDefined();
    expect(created.path).toBeDefined();
  });

  it('capabilities reflect correct flags', () => {
    const ds1 = makeMockDataSource([], {}, { canCreateContainer: true, canSelect: false });
    expect(ds1.capabilities.canCreateContainer).toBe(true);
    expect(ds1.capabilities.canSelect).toBe(false);

    const ds2 = makeMockDataSource([], {}, { canCreateContainer: false, canSelect: true });
    expect(ds2.capabilities.canCreateContainer).toBe(false);
    expect(ds2.capabilities.canSelect).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. createExplorerSource — claimed-tenant matching
// ---------------------------------------------------------------------------

describe('createExplorerSource claimed-tenant matching', () => {
  it('marks spaces as claimed when tenant cloudMeta matches item id', async () => {
    const spaces = [
      makeItem('drive-A', 'Drive A', 'container', '/drive-a'),
      makeItem('drive-B', 'Drive B', 'container', '/drive-b'),
    ];
    const tenants = [makeTenant('t1', { folderId: 'drive-A' })];
    const source = createExplorerSource(makeMockDataSource(spaces), tenants);

    const result = await source.getSpaces();
    expect(result[0]!.claimed).toBe(true);
    expect(result[1]!.claimed).toBeUndefined();
  });

  it('marks items as claimed when tenant cloudMeta matches item path', async () => {
    const items = [makeItem('f1', 'folder', 'container', '/root/data')];
    const tenants = [makeTenant('t1', { location: '/root/data' })];
    const source = createExplorerSource(
      makeMockDataSource([], { root: items }),
      tenants,
    );

    const result = await source.getItems('root');
    expect(result[0]!.claimed).toBe(true);
  });

  it('matches against any cloudMeta value, not just specific keys', async () => {
    const spaces = [makeItem('bucket-x', 'Bucket X', 'container', '/bx')];
    const tenants = [makeTenant('t1', { customField: 'bucket-x' })];
    const source = createExplorerSource(makeMockDataSource(spaces), tenants);

    const result = await source.getSpaces();
    expect(result[0]!.claimed).toBe(true);
  });

  it('does not claim when no tenants match', async () => {
    const spaces = [makeItem('s1', 'Space', 'container', '/s1')];
    const source = createExplorerSource(makeMockDataSource(spaces), []);

    const result = await source.getSpaces();
    expect(result[0]!.claimed).toBeUndefined();
  });

  it('handles multiple tenants — claims all matching items', async () => {
    const spaces = [
      makeItem('d1', 'Drive 1', 'container', '/d1'),
      makeItem('d2', 'Drive 2', 'container', '/d2'),
      makeItem('d3', 'Drive 3', 'container', '/d3'),
    ];
    const tenants = [
      makeTenant('t1', { folderId: 'd1' }),
      makeTenant('t2', { location: '/d2' }),
    ];
    const source = createExplorerSource(makeMockDataSource(spaces), tenants);

    const result = await source.getSpaces();
    expect(result[0]!.claimed).toBe(true);
    expect(result[1]!.claimed).toBe(true);
    expect(result[2]!.claimed).toBeUndefined();
  });

  it('preserves capabilities from the original data source', () => {
    const caps: ExplorerCapabilities = { canCreateContainer: false, canSelect: true };
    const ds = makeMockDataSource([], {}, caps);
    const source = createExplorerSource(ds, []);
    expect(source.capabilities).toEqual(caps);
  });

  it('delegates createContainer without claiming', async () => {
    const tenants = [makeTenant('t1', { folder: 'anything' })];
    const source = createExplorerSource(makeMockDataSource(), tenants);

    const container = await source.createContainer('root', 'my-folder');
    expect(container.name).toBe('my-folder');
    expect(container.type).toBe('container');
    // createContainer delegates directly — no claimed marking
    expect(container.claimed).toBeUndefined();
  });

  it('preserves ExplorerItem meta and other fields', async () => {
    const spaces: ExplorerItem[] = [
      { id: 's1', name: 'S1', type: 'container', path: '/s1', meta: { size: 42 } },
    ];
    const source = createExplorerSource(makeMockDataSource(spaces), []);
    const result = await source.getSpaces();

    expect(result[0]!.meta).toEqual({ size: 42 });
    expect(result[0]!.id).toBe('s1');
  });
});

// ---------------------------------------------------------------------------
// 3. CloudFileService type contract
// ---------------------------------------------------------------------------

describe('CloudFileService type contract', () => {
  it('satisfies the CloudFileService interface with a mock implementation', async () => {
    const service: CloudFileService = {
      listFiles: async (_folderId) => [{ id: 'f1', name: 'file.txt' }],
      readFile: async (_fileId) => new Uint8Array([1, 2, 3]),
      writeFile: async (_folderId, _name, _data) => 'written-id',
      deleteFile: async (_fileId) => {},
      createFolder: async (_parentId, _name) => 'folder-id',
    };

    const files = await service.listFiles('folder-1');
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({ id: 'f1', name: 'file.txt' });

    const data = await service.readFile('f1');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(3);

    const writeResult = await service.writeFile('folder-1', 'new.txt', new Uint8Array([4, 5]));
    expect(typeof writeResult).toBe('string');

    await service.deleteFile('f1'); // should not throw

    const folderId = await service.createFolder('root', 'sub');
    expect(typeof folderId).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 4. CloudObjectService type contract
// ---------------------------------------------------------------------------

describe('CloudObjectService type contract', () => {
  it('satisfies the CloudObjectService interface with a mock implementation', async () => {
    const store = new Map<string, Uint8Array>();

    const service: CloudObjectService = {
      listObjects: async (_prefix) => {
        return Array.from(store.entries()).map(([key, data]) => ({
          key,
          size: data.length,
        }));
      },
      getObject: async (key) => store.get(key) ?? new Uint8Array(),
      putObject: async (key, data) => { store.set(key, data); },
      deleteObject: async (key) => { store.delete(key); },
    };

    await service.putObject('a/b.json', new Uint8Array([10, 20]));
    const list = await service.listObjects('a/');
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ key: 'a/b.json', size: 2 });

    const obj = await service.getObject('a/b.json');
    expect(obj).toEqual(new Uint8Array([10, 20]));

    await service.deleteObject('a/b.json');
    const afterDelete = await service.listObjects('a/');
    expect(afterDelete).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. React hooks barrel exports
// ---------------------------------------------------------------------------

describe('React hooks barrel exports', () => {
  it('exports StrataProvider and useStrata from react module', async () => {
    const reactModule = await import('../../../src/react/index.js');
    expect(reactModule.StrataProvider).toBeDefined();
    expect(typeof reactModule.StrataProvider).toBe('function');
    expect(reactModule.useStrata).toBeDefined();
    expect(typeof reactModule.useStrata).toBe('function');
  });

  it('exports useRepo from react module', async () => {
    const reactModule = await import('../../../src/react/index.js');
    expect(reactModule.useRepo).toBeDefined();
    expect(typeof reactModule.useRepo).toBe('function');
  });

  it('exports useObserve and useQuery from react module', async () => {
    const reactModule = await import('../../../src/react/index.js');
    expect(reactModule.useObserve).toBeDefined();
    expect(typeof reactModule.useObserve).toBe('function');
    expect(reactModule.useQuery).toBeDefined();
    expect(typeof reactModule.useQuery).toBe('function');
  });

  it('exports useTenant, useTenantList, useIsDirty from react module', async () => {
    const reactModule = await import('../../../src/react/index.js');
    expect(reactModule.useTenant).toBeDefined();
    expect(typeof reactModule.useTenant).toBe('function');
    expect(reactModule.useTenantList).toBeDefined();
    expect(typeof reactModule.useTenantList).toBe('function');
    expect(reactModule.useIsDirty).toBeDefined();
    expect(typeof reactModule.useIsDirty).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 6. Cloud Explorer barrel exports
// ---------------------------------------------------------------------------

describe('Cloud Explorer barrel exports', () => {
  it('exports createExplorerSource function', async () => {
    const mod = await import('../../../src/cloud-explorer/index.js');
    expect(mod.createExplorerSource).toBeDefined();
    expect(typeof mod.createExplorerSource).toBe('function');
  });

  it('exports CloudExplorer component', async () => {
    const mod = await import('../../../src/cloud-explorer/index.js');
    expect(mod.CloudExplorer).toBeDefined();
    expect(typeof mod.CloudExplorer).toBe('function');
  });
});
