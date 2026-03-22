import { useState, useEffect, useCallback } from 'react';
import type { ExplorerDataSource, ExplorerItem } from './types.js';

export type CloudExplorerProps = {
  readonly dataSource: ExplorerDataSource;
  readonly onSelect: (item: ExplorerItem) => void;
  readonly onCancel: () => void;
};

type NavigationEntry = {
  readonly id: string;
  readonly name: string;
};

export function CloudExplorer({ dataSource, onSelect, onCancel }: CloudExplorerProps) {
  const [items, setItems] = useState<ReadonlyArray<ExplorerItem>>([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<ReadonlyArray<NavigationEntry>>([]);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async (parentId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = parentId
        ? await dataSource.getItems(parentId)
        : await dataSource.getSpaces();
      setItems(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [dataSource]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleNavigate = useCallback((item: ExplorerItem) => {
    if (item.type === 'container') {
      setPath((prev) => [...prev, { id: item.id, name: item.name }]);
      void loadItems(item.id);
    }
  }, [loadItems]);

  const handleBack = useCallback(() => {
    setPath((prev) => {
      const next = prev.slice(0, -1);
      const parentId = next.length > 0 ? next[next.length - 1]!.id : undefined;
      void loadItems(parentId);
      return next;
    });
  }, [loadItems]);

  const handleSelect = useCallback((item: ExplorerItem) => {
    if (dataSource.capabilities.canSelect) {
      onSelect(item);
    }
  }, [dataSource, onSelect]);

  const breadcrumb = ['Root', ...path.map((p) => p.name)].join(' / ');

  if (error) {
    return (
      <div data-testid="cloud-explorer">
        <div data-testid="explorer-error">{error}</div>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div data-testid="cloud-explorer">
      <div data-testid="explorer-breadcrumb">{breadcrumb}</div>
      <div data-testid="explorer-controls">
        {path.length > 0 && <button onClick={handleBack}>Back</button>}
        <button onClick={onCancel}>Cancel</button>
      </div>
      {loading ? (
        <div data-testid="explorer-loading">Loading...</div>
      ) : (
        <ul data-testid="explorer-list">
          {items.map((item) => (
            <li key={item.id} data-testid={`explorer-item-${item.id}`}>
              <span>{item.type === 'container' ? '📁' : '📄'} {item.name}</span>
              {item.claimed && <span data-testid="claimed-badge"> (claimed)</span>}
              {item.type === 'container' && (
                <button onClick={() => handleNavigate(item)}>Open</button>
              )}
              {dataSource.capabilities.canSelect && (
                <button onClick={() => handleSelect(item)}>Select</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
