import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity } from '../entity/index.js';
import { createEntityStore } from './store.js';

function makeEntity(id: string, version = 1): BaseEntity {
  return {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    version,
    device: 'test',
    hlc: { timestamp: Date.now(), counter: 0, nodeId: 'node1' },
  };
}

describe('createEntityStore', () => {
  describe('save and get', () => {
    it('should save and retrieve an entity', () => {
      const store = createEntityStore();
      const entity = makeEntity('e1');
      store.save('task._', entity);
      expect(store.get('task._', 'e1')).toBe(entity);
    });

    it('should return undefined for missing entity', () => {
      const store = createEntityStore();
      expect(store.get('task._', 'missing')).toBeUndefined();
    });

    it('should upsert on save', () => {
      const store = createEntityStore();
      const v1 = makeEntity('e1', 1);
      const v2 = makeEntity('e1', 2);
      store.save('task._', v1);
      store.save('task._', v2);
      expect(store.get('task._', 'e1')).toBe(v2);
    });
  });

  describe('saveMany and getAll', () => {
    it('should save multiple entities', () => {
      const store = createEntityStore();
      const entities = [makeEntity('e1'), makeEntity('e2')];
      store.saveMany('task._', entities);
      expect(store.getAll('task._')).toHaveLength(2);
    });

    it('should return empty array for missing partition', () => {
      const store = createEntityStore();
      expect(store.getAll('missing._')).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should remove an entity', () => {
      const store = createEntityStore();
      store.save('task._', makeEntity('e1'));
      store.delete('task._', 'e1');
      expect(store.get('task._', 'e1')).toBeUndefined();
    });

    it('should not throw for missing entity', () => {
      const store = createEntityStore();
      expect(() => store.delete('task._', 'missing')).not.toThrow();
    });
  });

  describe('deleteMany', () => {
    it('should remove multiple entities', () => {
      const store = createEntityStore();
      store.saveMany('task._', [
        makeEntity('e1'),
        makeEntity('e2'),
        makeEntity('e3'),
      ]);
      store.deleteMany('task._', ['e1', 'e3']);
      expect(store.getAll('task._')).toHaveLength(1);
      expect(store.get('task._', 'e2')).toBeDefined();
    });
  });

  describe('partition tracking', () => {
    it('should list partitions for entity name', () => {
      const store = createEntityStore();
      store.save('task.jan', makeEntity('e1'));
      store.save('task.feb', makeEntity('e2'));
      store.save('other._', makeEntity('e3'));
      const partitions = store.listPartitions('task');
      expect(partitions).toHaveLength(2);
      expect(partitions).toContain('task.jan');
      expect(partitions).toContain('task.feb');
    });

    it('should check if partition exists', () => {
      const store = createEntityStore();
      store.save('task._', makeEntity('e1'));
      expect(store.hasPartition('task._')).toBe(true);
      expect(store.hasPartition('missing._')).toBe(false);
    });

    it('should return empty array for unknown entity name', () => {
      const store = createEntityStore();
      expect(store.listPartitions('unknown')).toEqual([]);
    });
  });

  describe('lazy loading', () => {
    it('should trigger loader on first get', () => {
      const loader = vi.fn().mockResolvedValue([]);
      const store = createEntityStore(loader);
      store.get('task._', 'e1');
      expect(loader).toHaveBeenCalledWith('task._');
    });

    it('should not trigger loader for loaded partition', () => {
      const loader = vi.fn().mockResolvedValue([]);
      const store = createEntityStore(loader);
      store.save('task._', makeEntity('e1'));
      store.get('task._', 'e1');
      expect(loader).not.toHaveBeenCalled();
    });

    it('should populate store when loader resolves', async () => {
      const entities = [makeEntity('e1'), makeEntity('e2')];
      const loader = vi.fn().mockResolvedValue(entities);
      const store = createEntityStore(loader);
      store.get('task._', 'e1');
      await Promise.resolve();
      expect(store.getAll('task._')).toHaveLength(2);
    });

    it('should trigger loader on first getAll', () => {
      const loader = vi.fn().mockResolvedValue([]);
      const store = createEntityStore(loader);
      store.getAll('task._');
      expect(loader).toHaveBeenCalledWith('task._');
    });

    it('should not re-trigger loader while loading', () => {
      const loader = vi.fn().mockResolvedValue([]);
      const store = createEntityStore(loader);
      store.get('task._', 'e1');
      store.get('task._', 'e2');
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });
});
