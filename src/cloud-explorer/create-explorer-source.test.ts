import { describe, it, expect } from 'vitest';
import type { ExplorerDataSource, ExplorerItem } from './types.js';
import type { Tenant } from '../tenant/index.js';
import { createExplorerSource } from './create-explorer-source.js';

function makeTenant(overrides: Partial<Tenant> & { id: string; cloudMeta: Readonly<Record<string, unknown>> }): Tenant {
  return {
    name: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDataSource(spaces: ExplorerItem[], items: Record<string, ExplorerItem[]> = {}): ExplorerDataSource {
  return {
    getSpaces: async () => spaces,
    getItems: async (parentId) => items[parentId] ?? [],
    createContainer: async (_p, name) => ({ id: `new-${name}`, name, type: 'container' as const, path: `/${name}` }),
    capabilities: { canCreateContainer: true, canSelect: true },
  };
}

describe('createExplorerSource', () => {
  it('marks items as claimed when tenant cloudMeta matches item id', async () => {
    const spaces: ExplorerItem[] = [
      { id: 'drive-1', name: 'My Drive', type: 'container', path: '/drive-1' },
      { id: 'drive-2', name: 'Other Drive', type: 'container', path: '/drive-2' },
    ];

    const tenants = [
      makeTenant({ id: 't1', cloudMeta: { folderId: 'drive-1' } }),
    ];

    const source = createExplorerSource(makeDataSource(spaces), tenants);
    const result = await source.getSpaces();

    expect(result[0]!.claimed).toBe(true);
    expect(result[1]!.claimed).toBeUndefined();
  });

  it('marks items as claimed when tenant cloudMeta matches item path', async () => {
    const items: ExplorerItem[] = [
      { id: 'f1', name: 'folder-a', type: 'container', path: '/root/folder-a' },
    ];

    const tenants = [
      makeTenant({ id: 't1', cloudMeta: { location: '/root/folder-a' } }),
    ];

    const source = createExplorerSource(makeDataSource([], { root: items }), tenants);
    const result = await source.getItems('root');

    expect(result[0]!.claimed).toBe(true);
  });

  it('does not mark items when no tenant matches', async () => {
    const spaces: ExplorerItem[] = [
      { id: 'drive-1', name: 'My Drive', type: 'container', path: '/drive-1' },
    ];

    const source = createExplorerSource(makeDataSource(spaces), []);
    const result = await source.getSpaces();

    expect(result[0]!.claimed).toBeUndefined();
  });

  it('preserves capabilities from the original data source', () => {
    const ds = makeDataSource([]);
    const source = createExplorerSource(ds, []);
    expect(source.capabilities).toEqual(ds.capabilities);
  });

  it('delegates createContainer to the original data source', async () => {
    const source = createExplorerSource(makeDataSource([]), []);
    const container = await source.createContainer('root', 'new-folder');
    expect(container.name).toBe('new-folder');
    expect(container.type).toBe('container');
  });
});
