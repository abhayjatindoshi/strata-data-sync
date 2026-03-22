import type { Tenant } from '../tenant/index.js';
import type { ExplorerDataSource, ExplorerItem } from './types.js';

function markClaimed(
  items: ReadonlyArray<ExplorerItem>,
  tenants: ReadonlyArray<Tenant>,
): ReadonlyArray<ExplorerItem> {
  return items.map((item) => {
    const isClaimed = tenants.some((tenant) => {
      const meta = tenant.cloudMeta;
      // Match if any tenant cloudMeta value matches the item's id or path
      return Object.values(meta).some(
        (v) => v === item.id || v === item.path,
      );
    });
    return isClaimed ? { ...item, claimed: true } : item;
  });
}

export function createExplorerSource(
  dataSource: ExplorerDataSource,
  tenants: ReadonlyArray<Tenant>,
): ExplorerDataSource {
  return {
    capabilities: dataSource.capabilities,
    async getSpaces() {
      const spaces = await dataSource.getSpaces();
      return markClaimed(spaces, tenants);
    },
    async getItems(parentId: string) {
      const items = await dataSource.getItems(parentId);
      return markClaimed(items, tenants);
    },
    async createContainer(parentId: string, name: string) {
      return dataSource.createContainer(parentId, name);
    },
  };
}
