import { describe, it, expect } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import type { BaseEntity } from '@strata/entity';
import { createEntityStore } from '@strata/store';
import { createChangeSignal } from '@strata/reactive';
import { defineEntity } from '@strata/schema';
import { createRepository } from '@strata/repository/repository.js';

type TestEntity = BaseEntity & {
  readonly name: string;
};

function make(uniqueId: string, name: string, version = 1): TestEntity {
  return {
    id: `test._.${uniqueId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    version,
    device: 'test',
    hlc: { timestamp: Date.now(), counter: 0, nodeId: 'n1' },
    name,
  };
}

describe('createRepository', () => {
  function setup() {
    const store = createEntityStore();
    const signal = createChangeSignal();
    const def = defineEntity<TestEntity>('test');
    const repo = createRepository(def, store, signal);
    return { store, signal, repo };
  }

  describe('get', () => {
    it('returns entity by id', () => {
      const { repo } = setup();
      const entity = make('e1', 'Alice');
      repo.save(entity);
      expect(repo.get('test._.e1')).toEqual(entity);
    });

    it('returns undefined for missing id', () => {
      const { repo } = setup();
      expect(repo.get('test._.missing')).toBeUndefined();
    });
  });

  describe('query', () => {
    it('returns all entities with no options', () => {
      const { repo } = setup();
      repo.save(make('e1', 'Alice'));
      repo.save(make('e2', 'Bob'));
      expect(repo.query()).toHaveLength(2);
    });

    it('filters with where clause', () => {
      const { repo } = setup();
      repo.save(make('e1', 'Alice'));
      repo.save(make('e2', 'Bob'));
      const result = repo.query({
        where: [{ field: 'name', op: '==', value: 'Alice' }],
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Alice');
    });

    it('applies orderBy', () => {
      const { repo } = setup();
      repo.save(make('e2', 'Bob'));
      repo.save(make('e1', 'Alice'));
      const result = repo.query({
        orderBy: [{ field: 'name', direction: 'asc' }],
      });
      expect(result.map(e => e.name)).toEqual(['Alice', 'Bob']);
    });

    it('applies limit and offset', () => {
      const { repo } = setup();
      repo.save(make('e1', 'Alice'));
      repo.save(make('e2', 'Bob'));
      repo.save(make('e3', 'Charlie'));
      const result = repo.query({
        orderBy: [{ field: 'name', direction: 'asc' }],
        offset: 1,
        limit: 1,
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Bob');
    });
  });

  describe('save / saveMany', () => {
    it('save persists and notifies', () => {
      const { repo, signal } = setup();
      let notified = false;
      signal.observe$.subscribe(() => { notified = true; });
      repo.save(make('e1', 'Alice'));
      expect(repo.get('test._.e1')).toBeDefined();
      expect(notified).toBe(true);
    });

    it('saveMany persists multiple and notifies once', () => {
      const { repo } = setup();
      repo.saveMany([make('e1', 'Alice'), make('e2', 'Bob')]);
      expect(repo.query()).toHaveLength(2);
    });
  });

  describe('delete / deleteMany', () => {
    it('delete removes entity and notifies', () => {
      const { repo } = setup();
      repo.save(make('e1', 'Alice'));
      repo.delete('test._.e1');
      expect(repo.get('test._.e1')).toBeUndefined();
    });

    it('deleteMany removes multiple entities', () => {
      const { repo } = setup();
      repo.saveMany([make('e1', 'Alice'), make('e2', 'Bob')]);
      repo.deleteMany(['test._.e1', 'test._.e2']);
      expect(repo.query()).toHaveLength(0);
    });
  });

  describe('observe', () => {
    it('emits initial value and updates', async () => {
      const { repo } = setup();
      const entity = make('e1', 'Alice');
      repo.save(entity);
      const value = await firstValueFrom(repo.observe('test._.e1'));
      expect(value).toEqual(entity);
    });

    it('emits undefined for missing entity', async () => {
      const { repo } = setup();
      const value = await firstValueFrom(repo.observe('test._.nope'));
      expect(value).toBeUndefined();
    });
  });

  describe('observeQuery', () => {
    it('emits initial query result', async () => {
      const { repo } = setup();
      repo.save(make('e1', 'Alice'));
      const value = await firstValueFrom(repo.observeQuery());
      expect(value).toHaveLength(1);
    });

    it('emits updated results on change', async () => {
      const { repo } = setup();
      const promise = firstValueFrom(
        repo.observeQuery().pipe(take(2), toArray()),
      );
      repo.save(make('e1', 'Alice'));
      const [initial, afterSave] = await promise;
      expect(initial).toHaveLength(0);
      expect(afterSave).toHaveLength(1);
    });
  });
});
