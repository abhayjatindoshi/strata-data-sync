import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, skip } from 'rxjs';
import {
  createStrata,
  defineEntity,
  MemoryBlobAdapter,
  singleton,
  global,
  partitioned,
  buildEntityId,
} from '../../../src/index.js';
import type {
  Strata,
  BaseEntity,
  Repository,
  SingletonRepository,
} from '../../../src/index.js';

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

type Todo = BaseEntity & {
  readonly title: string;
  readonly done: boolean;
};

type Settings = BaseEntity & {
  readonly theme: string;
  readonly locale: string;
};

type LogEntry = BaseEntity & {
  readonly message: string;
  readonly level: string;
  readonly month: string; // e.g. "2025-06"
};

// ---------------------------------------------------------------------------
// Entity definitions with different key strategies
// ---------------------------------------------------------------------------

const todoDef = defineEntity<Todo>('todo', { keyStrategy: global });
const settingsDef = defineEntity<Settings>('settings', { keyStrategy: singleton });
const logDef = defineEntity<LogEntry>('log', {
  keyStrategy: partitioned<LogEntry>((e) => e.month),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NODE = 'test-node-1';

function makeStrata(opts?: { cloudAdapter?: InstanceType<typeof MemoryBlobAdapter> }): Strata {
  return createStrata({
    entities: [todoDef, settingsDef, logDef],
    localAdapter: new MemoryBlobAdapter(),
    cloudAdapter: opts?.cloudAdapter,
    nodeId: NODE,
  });
}

let strata: Strata;

afterEach(async () => {
  if (strata) {
    await strata.dispose();
  }
});

function makeTodo(uniqueId: string, title: string, done = false): Todo {
  const now = new Date('2025-07-01T12:00:00Z');
  return {
    id: buildEntityId('todo', '_', uniqueId),
    title,
    done,
    createdAt: now,
    updatedAt: now,
    version: 1,
    device: NODE,
    hlc: { timestamp: Date.now(), counter: 0, nodeId: NODE },
  };
}

function makeSettings(theme: string, locale: string): Settings {
  const now = new Date('2025-07-01T12:00:00Z');
  return {
    id: buildEntityId('settings', '_', 'main'),
    theme,
    locale,
    createdAt: now,
    updatedAt: now,
    version: 1,
    device: NODE,
    hlc: { timestamp: Date.now(), counter: 0, nodeId: NODE },
  };
}

function makeLog(uniqueId: string, month: string, message: string, level = 'info'): LogEntry {
  const now = new Date('2025-07-01T12:00:00Z');
  return {
    id: buildEntityId('log', month, uniqueId),
    message,
    level,
    month,
    createdAt: now,
    updatedAt: now,
    version: 1,
    device: NODE,
    hlc: { timestamp: Date.now(), counter: 0, nodeId: NODE },
  };
}

// ---------------------------------------------------------------------------
// Tests: barrel exports
// ---------------------------------------------------------------------------

describe('barrel exports (src/index.ts)', () => {
  it('exports createStrata', () => {
    expect(createStrata).toBeTypeOf('function');
  });

  it('exports defineEntity', () => {
    expect(defineEntity).toBeTypeOf('function');
  });

  it('exports MemoryBlobAdapter', () => {
    expect(MemoryBlobAdapter).toBeTypeOf('function');
  });

  it('exports key strategies', () => {
    expect(singleton).toBeDefined();
    expect(global).toBeDefined();
    expect(partitioned).toBeTypeOf('function');
  });

  it('exports buildEntityId', () => {
    expect(buildEntityId).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// Tests: createStrata
// ---------------------------------------------------------------------------

describe('createStrata — instance creation', () => {
  it('creates a valid Strata instance', () => {
    strata = makeStrata();
    expect(strata).toBeDefined();
    expect(strata.repo).toBeTypeOf('function');
    expect(strata.tenants).toBeDefined();
    expect(strata.sync).toBeTypeOf('function');
    expect(strata.dispose).toBeTypeOf('function');
    expect(typeof strata.isDirty).toBe('boolean');
    expect(strata.isDirty$).toBeDefined();
  });

  it('creates with explicit cloudAdapter', () => {
    const cloud = new MemoryBlobAdapter();
    strata = makeStrata({ cloudAdapter: cloud });
    expect(strata).toBeDefined();
  });

  it('rejects empty entities array', () => {
    expect(() =>
      createStrata({
        entities: [],
        localAdapter: new MemoryBlobAdapter(),
        nodeId: NODE,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.repo() — global key strategy
// ---------------------------------------------------------------------------

describe('strata.repo() — global key strategy', () => {
  it('returns a repo with full CRUD for global entities', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    expect(repo.get).toBeTypeOf('function');
    expect(repo.query).toBeTypeOf('function');
    expect(repo.save).toBeTypeOf('function');
    expect(repo.saveMany).toBeTypeOf('function');
    expect(repo.delete).toBeTypeOf('function');
    expect(repo.deleteMany).toBeTypeOf('function');
    expect(repo.observe).toBeTypeOf('function');
    expect(repo.observeQuery).toBeTypeOf('function');
  });

  it('saves and retrieves an entity', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    const todo = makeTodo('t1', 'Buy milk');
    repo.save(todo);
    expect(repo.get(todo.id)).toEqual(todo);
  });

  it('returns undefined for non-existent entity', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    expect(repo.get('todo._.nonexistent')).toBeUndefined();
  });

  it('saves multiple entities with saveMany', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    const todos = [
      makeTodo('t1', 'Task 1'),
      makeTodo('t2', 'Task 2'),
      makeTodo('t3', 'Task 3'),
    ];
    repo.saveMany(todos);
    expect(repo.get(todos[0]!.id)).toEqual(todos[0]);
    expect(repo.get(todos[1]!.id)).toEqual(todos[1]);
    expect(repo.get(todos[2]!.id)).toEqual(todos[2]);
  });

  it('queries all entities without options', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    repo.save(makeTodo('t1', 'A'));
    repo.save(makeTodo('t2', 'B'));
    const all = repo.query();
    expect(all).toHaveLength(2);
  });

  it('queries with where clause', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    repo.save(makeTodo('t1', 'Buy milk', true));
    repo.save(makeTodo('t2', 'Walk dog', false));
    repo.save(makeTodo('t3', 'Clean', true));
    const done = repo.query({ where: [{ field: 'done', op: '==', value: true }] });
    expect(done).toHaveLength(2);
    expect(done.every((t) => t.done)).toBe(true);
  });

  it('queries with orderBy', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    repo.save(makeTodo('t1', 'Zulu'));
    repo.save(makeTodo('t2', 'Alpha'));
    repo.save(makeTodo('t3', 'Mike'));
    const sorted = repo.query({ orderBy: [{ field: 'title', direction: 'asc' }] });
    expect(sorted[0]!.title).toBe('Alpha');
    expect(sorted[1]!.title).toBe('Mike');
    expect(sorted[2]!.title).toBe('Zulu');
  });

  it('queries with limit and offset', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    for (let i = 0; i < 10; i++) {
      repo.save(makeTodo(`t${i}`, `Task ${i}`));
    }
    const page = repo.query({ limit: 3, offset: 2 });
    expect(page).toHaveLength(3);
  });

  it('deletes an entity', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    const todo = makeTodo('t1', 'Doomed');
    repo.save(todo);
    expect(repo.get(todo.id)).toBeDefined();
    repo.delete(todo.id);
    expect(repo.get(todo.id)).toBeUndefined();
  });

  it('deleteMany removes multiple entities', () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    const t1 = makeTodo('t1', 'One');
    const t2 = makeTodo('t2', 'Two');
    const t3 = makeTodo('t3', 'Three');
    repo.saveMany([t1, t2, t3]);
    repo.deleteMany([t1.id, t2.id]);
    expect(repo.get(t1.id)).toBeUndefined();
    expect(repo.get(t2.id)).toBeUndefined();
    expect(repo.get(t3.id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.repo() — singleton key strategy
// ---------------------------------------------------------------------------

describe('strata.repo() — singleton key strategy', () => {
  it('returns a SingletonRepository', () => {
    strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    expect(repo.get).toBeTypeOf('function');
    expect(repo.save).toBeTypeOf('function');
    expect(repo.delete).toBeTypeOf('function');
    expect(repo.observe).toBeTypeOf('function');
    // SingletonRepository should NOT have query/saveMany/deleteMany
    expect((repo as any).query).toBeUndefined();
    expect((repo as any).saveMany).toBeUndefined();
    expect((repo as any).deleteMany).toBeUndefined();
  });

  it('saves and retrieves singleton', () => {
    strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    const s = makeSettings('dark', 'en-US');
    repo.save(s);
    expect(repo.get()).toEqual(s);
  });

  it('overwrites singleton on re-save', () => {
    strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    repo.save(makeSettings('dark', 'en-US'));
    const updated = makeSettings('light', 'fr-FR');
    repo.save(updated);
    expect(repo.get()?.theme).toBe('light');
  });

  it('get returns undefined when empty', () => {
    strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    expect(repo.get()).toBeUndefined();
  });

  it('delete removes singleton', () => {
    strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    repo.save(makeSettings('dark', 'en'));
    repo.delete();
    expect(repo.get()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.repo() — partitioned key strategy
// ---------------------------------------------------------------------------

describe('strata.repo() — partitioned key strategy', () => {
  it('saves entities into appropriate partitions', () => {
    strata = makeStrata();
    const repo = strata.repo(logDef) as Repository<LogEntry>;
    const jan = makeLog('l1', '2025-01', 'January log');
    const feb = makeLog('l2', '2025-02', 'February log');
    repo.save(jan);
    repo.save(feb);
    expect(repo.get(jan.id)).toEqual(jan);
    expect(repo.get(feb.id)).toEqual(feb);
  });

  it('queries across partitions', () => {
    strata = makeStrata();
    const repo = strata.repo(logDef) as Repository<LogEntry>;
    repo.save(makeLog('l1', '2025-01', 'Log A'));
    repo.save(makeLog('l2', '2025-02', 'Log B'));
    repo.save(makeLog('l3', '2025-01', 'Log C'));
    const all = repo.query();
    expect(all).toHaveLength(3);
  });

  it('queries with where across partitions', () => {
    strata = makeStrata();
    const repo = strata.repo(logDef) as Repository<LogEntry>;
    repo.save(makeLog('l1', '2025-01', 'Error!', 'error'));
    repo.save(makeLog('l2', '2025-02', 'Info msg', 'info'));
    repo.save(makeLog('l3', '2025-01', 'Another error', 'error'));
    const errors = repo.query({ where: [{ field: 'level', op: '==', value: 'error' }] });
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.level === 'error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: repo caching
// ---------------------------------------------------------------------------

describe('strata.repo() — caching', () => {
  it('returns the same repo instance on repeated calls', () => {
    strata = makeStrata();
    const r1 = strata.repo(todoDef);
    const r2 = strata.repo(todoDef);
    expect(r1).toBe(r2);
  });

  it('returns different repos for different entity definitions', () => {
    strata = makeStrata();
    const todoRepo = strata.repo(todoDef);
    const settingsRepo = strata.repo(settingsDef);
    expect(todoRepo).not.toBe(settingsRepo);
  });

  it('throws for unregistered entity', () => {
    strata = makeStrata();
    const unknown = defineEntity<Todo>('unknown', { keyStrategy: global });
    expect(() => strata.repo(unknown)).toThrow(/not registered/);
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.repo() — observe (reactive)
// ---------------------------------------------------------------------------

describe('strata.repo() — observe', () => {
  it('observe emits on entity change (global repo)', async () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    const todo = makeTodo('obs1', 'Watch me');

    // subscribe to the next emission after a save
    const promise = firstValueFrom(repo.observe(todo.id).pipe(skip(1)));
    repo.save(todo);
    const result = await promise;
    expect(result).toEqual(todo);
  });

  it('observeQuery emits updated list on change', async () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;

    const promise = firstValueFrom(repo.observeQuery().pipe(skip(1)));
    repo.save(makeTodo('oq1', 'First'));
    const result = await promise;
    expect(result).toHaveLength(1);
  });

  it('singleton observe emits on change', async () => {
    strata = makeStrata();
    const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
    const s = makeSettings('dark', 'en');

    const promise = firstValueFrom(repo.observe().pipe(skip(1)));
    repo.save(s);
    const result = await promise;
    expect(result).toEqual(s);
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.sync()
// ---------------------------------------------------------------------------

describe('strata.sync()', () => {
  it('sync resolves without error on fresh instance', async () => {
    strata = makeStrata();
    await expect(strata.sync()).resolves.toBeUndefined();
  });

  it('sync persists data to adapter and can be re-loaded', async () => {
    const local = new MemoryBlobAdapter();
    const cloud = new MemoryBlobAdapter();

    // Instance 1 — save and sync
    strata = createStrata({
      entities: [todoDef, settingsDef, logDef],
      localAdapter: local,
      cloudAdapter: cloud,
      nodeId: NODE,
    });
    const repo = strata.repo(todoDef) as Repository<Todo>;
    repo.save(makeTodo('s1', 'Synced item'));
    await strata.sync();
    await strata.dispose();

    // Instance 2 — same adapters, hydrate by sync
    strata = createStrata({
      entities: [todoDef, settingsDef, logDef],
      localAdapter: local,
      cloudAdapter: cloud,
      nodeId: 'node-2',
    });
    await strata.sync();
    const repo2 = strata.repo(todoDef) as Repository<Todo>;
    const item = repo2.get(buildEntityId('todo', '_', 's1'));
    expect(item).toBeDefined();
    expect(item?.title).toBe('Synced item');
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.tenants
// ---------------------------------------------------------------------------

describe('strata.tenants', () => {
  it('exposes tenant manager with expected methods', () => {
    strata = makeStrata();
    expect(strata.tenants.list).toBeTypeOf('function');
    expect(strata.tenants.create).toBeTypeOf('function');
    expect(strata.tenants.load).toBeTypeOf('function');
    expect(strata.tenants.dispose).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.isDirty
// ---------------------------------------------------------------------------

describe('strata.isDirty', () => {
  it('starts as false', () => {
    strata = makeStrata();
    expect(strata.isDirty).toBe(false);
  });

  it('isDirty$ emits initial false', async () => {
    strata = makeStrata();
    const value = await firstValueFrom(strata.isDirty$);
    expect(value).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: strata.dispose()
// ---------------------------------------------------------------------------

describe('strata.dispose()', () => {
  it('completes without error', async () => {
    strata = makeStrata();
    await expect(strata.dispose()).resolves.toBeUndefined();
  });

  it('can be called multiple times safely', async () => {
    strata = makeStrata();
    await strata.dispose();
    await expect(strata.dispose()).resolves.toBeUndefined();
  });

  it('repos still exist after dispose but strata is disposed', async () => {
    strata = makeStrata();
    const repo = strata.repo(todoDef) as Repository<Todo>;
    repo.save(makeTodo('d1', 'Before dispose'));
    await strata.dispose();
    // The repo reference still holds but the underlying signals are disposed
    // The in-memory store is still readable (it's just a Map)
    expect(repo.get(buildEntityId('todo', '_', 'd1'))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: cross-cutting — multiple entity types in one Strata instance
// ---------------------------------------------------------------------------

describe('cross-cutting — multiple entity types', () => {
  it('different repos are independent', () => {
    strata = makeStrata();
    const todoRepo = strata.repo(todoDef) as Repository<Todo>;
    const logRepo = strata.repo(logDef) as Repository<LogEntry>;
    const settingsRepo = strata.repo(settingsDef) as SingletonRepository<Settings>;

    todoRepo.save(makeTodo('x1', 'Todo'));
    logRepo.save(makeLog('x1', '2025-06', 'Log message'));
    settingsRepo.save(makeSettings('dark', 'en'));

    expect(todoRepo.query()).toHaveLength(1);
    expect(logRepo.query()).toHaveLength(1);
    expect(settingsRepo.get()).toBeDefined();
  });

  it('deleting from one repo does not affect others', () => {
    strata = makeStrata();
    const todoRepo = strata.repo(todoDef) as Repository<Todo>;
    const logRepo = strata.repo(logDef) as Repository<LogEntry>;

    const todo = makeTodo('y1', 'To delete');
    const log = makeLog('y1', '2025-06', 'Keep me');
    todoRepo.save(todo);
    logRepo.save(log);

    todoRepo.delete(todo.id);
    expect(todoRepo.get(todo.id)).toBeUndefined();
    expect(logRepo.get(log.id)).toEqual(log);
  });
});
