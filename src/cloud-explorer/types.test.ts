import { describe, it, expect } from 'vitest';
import type { ExplorerDataSource, ExplorerItem, ExplorerCapabilities } from './types.js';

describe('ExplorerDataSource contract', () => {
  it('accepts a valid ExplorerDataSource implementation', () => {
    const source: ExplorerDataSource = {
      getSpaces: async () => [],
      getItems: async (_parentId: string) => [],
      createContainer: async (_parentId: string, name: string) => ({
        id: '1',
        name,
        type: 'container' as const,
        path: `/${name}`,
      }),
      capabilities: { canCreateContainer: true, canSelect: true },
    };

    expect(source.capabilities.canCreateContainer).toBe(true);
    expect(source.capabilities.canSelect).toBe(true);
  });

  it('ExplorerItem supports optional meta and claimed fields', () => {
    const item: ExplorerItem = {
      id: '1',
      name: 'test',
      type: 'item',
      path: '/test',
      meta: { folder: 'abc' },
      claimed: true,
    };
    expect(item.claimed).toBe(true);
    expect(item.meta).toEqual({ folder: 'abc' });
  });

  it('ExplorerCapabilities shape is correct', () => {
    const caps: ExplorerCapabilities = {
      canCreateContainer: false,
      canSelect: true,
    };
    expect(caps.canCreateContainer).toBe(false);
  });

  it('getSpaces returns array of ExplorerItems', async () => {
    const source: ExplorerDataSource = {
      getSpaces: async () => [
        { id: 'root', name: 'My Drive', type: 'container', path: '/' },
      ],
      getItems: async () => [],
      createContainer: async (_p, name) => ({ id: '2', name, type: 'container', path: `/${name}` }),
      capabilities: { canCreateContainer: true, canSelect: true },
    };

    const spaces = await source.getSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]!.type).toBe('container');
  });

  it('getItems returns children for a parent', async () => {
    const items: ExplorerItem[] = [
      { id: 'f1', name: 'file.txt', type: 'item', path: '/root/file.txt' },
      { id: 'f2', name: 'subfolder', type: 'container', path: '/root/subfolder' },
    ];

    const source: ExplorerDataSource = {
      getSpaces: async () => [],
      getItems: async () => items,
      createContainer: async (_p, name) => ({ id: '3', name, type: 'container', path: `/${name}` }),
      capabilities: { canCreateContainer: true, canSelect: true },
    };

    const result = await source.getItems('root');
    expect(result).toHaveLength(2);
  });
});
