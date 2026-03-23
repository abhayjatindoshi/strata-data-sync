import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createStrata } from '@strata/strata/create-strata.js';
import { MemoryBlobAdapter } from '@strata/adapter';
import { defineEntity } from '@strata/schema';
import { global, singleton } from '@strata/key-strategy';
import type { BaseEntity } from '@strata/entity';
import type { Repository, SingletonRepository } from '@strata/repository';

type Todo = BaseEntity & { readonly title: string };
type Settings = BaseEntity & { readonly theme: string };

const todoDef = defineEntity<Todo>('todo', { keyStrategy: global });
const settingsDef = defineEntity<Settings>('settings', {
  keyStrategy: singleton,
});

function makeStrata() {
  return createStrata({
    entities: [todoDef, settingsDef],
    localAdapter: new MemoryBlobAdapter(),
    nodeId: 'node-1',
  });
}

function makeTodo(id: string, title: string): Todo {
  const now = new Date();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    version: 1,
    device: 'node-1',
    hlc: { timestamp: Date.now(), counter: 0, nodeId: 'node-1' },
  };
}

describe('createStrata', () => {
  it('creates a strata instance', () => {
    const strata = makeStrata();
    expect(strata).toBeDefined();
    expect(strata.repo).toBeDefined();
    expect(strata.tenants).toBeDefined();
    expect(strata.sync).toBeDefined();
    expect(strata.dispose).toBeDefined();
  });

  it('throws on invalid config', () => {
    expect(() =>
      createStrata({
        entities: [],
        localAdapter: new MemoryBlobAdapter(),
        nodeId: 'n',
      }),
    ).toThrow('entities array must not be empty');
  });
});

describe('strata.repo', () => {
  it('returns a Repository for global key strategy', () => {
    const strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    expect(repo.get).toBeDefined();
    expect(repo.query).toBeDefined();
    expect(repo.save).toBeDefined();
    expect(repo.delete).toBeDefined();
  });

  it('returns a SingletonRepository for singleton key strategy', () => {
    const strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    expect(repo.get).toBeDefined();
    expect(repo.save).toBeDefined();
    expect(repo.delete).toBeDefined();
  });

  it('caches repo instances', () => {
    const strata = makeStrata();
    const r1 = strata.repo(todoDef);
    const r2 = strata.repo(todoDef);
    expect(r1).toBe(r2);
  });

  it('throws for unregistered entity', () => {
    const strata = makeStrata();
    const unknown = defineEntity<Todo>('unknown', { keyStrategy: global });
    expect(() => strata.repo(unknown)).toThrow(
      'Entity "unknown" was not registered in createStrata config',
    );
  });

  it('can save and retrieve entities', () => {
    const strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    const todo = makeTodo('todo._.abc', 'Buy milk');
    repo.save(todo);
    expect(repo.get('todo._.abc')).toEqual(todo);
  });
});

describe('strata.tenants', () => {
  it('exposes tenant manager', () => {
    const strata = makeStrata();
    expect(strata.tenants.list).toBeDefined();
    expect(strata.tenants.create).toBeDefined();
    expect(strata.tenants.load).toBeDefined();
    expect(strata.tenants.dispose).toBeDefined();
  });
});

describe('strata.sync', () => {
  it('returns a promise', async () => {
    const strata = makeStrata();
    const result = strata.sync();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

describe('strata.isDirty', () => {
  it('starts as not dirty', () => {
    const strata = makeStrata();
    expect(strata.isDirty).toBe(false);
  });

  it('exposes isDirty$ observable', async () => {
    const strata = makeStrata();
    const value = await firstValueFrom(strata.isDirty$);
    expect(value).toBe(false);
  });
});

describe('strata.dispose', () => {
  it('completes without error', async () => {
    const strata = makeStrata();
    await expect(strata.dispose()).resolves.toBeUndefined();
  });

  it('can be called multiple times safely', async () => {
    const strata = makeStrata();
    await strata.dispose();
    // Second dispose should not throw (sync engine guards against it)
    await expect(strata.dispose()).resolves.toBeUndefined();
  });
});
