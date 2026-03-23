import { describe, it, expect } from 'vitest';
import { createRepository, createSingletonRepository } from '@strata/repository';
import { defineEntity } from '@strata/schema';
import { createEntityStore } from '@strata/store';
import { createChangeSignal } from '@strata/reactive';
import { global as globalStrategy, singleton as singletonStrategy } from '@strata/key-strategy';
import { buildEntityId } from '@strata/entity';
import { createSyncScheduler, createFlushMechanism, comparePartitionIndexes, mergePartitionBlobs } from '@strata/sync';
import { computePartitionHash } from '@strata/persistence';
import type { BaseEntity } from '@strata/entity';
import type { PartitionBlob, PartitionIndex } from '@strata/persistence';
import type { Hlc } from '@strata/hlc';
import { firstValueFrom, take, toArray } from 'rxjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Task = BaseEntity & {
  readonly title: string;
  readonly priority: number;
  readonly done: boolean;
};

type AppSettings = BaseEntity & {
  readonly theme: string;
  readonly locale: string;
};

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    createdAt: new Date('2025-06-01T10:00:00Z'),
    updatedAt: new Date('2025-06-01T10:00:00Z'),
    version: 1,
    device: 'dev-a',
    hlc: { timestamp: 1700000000000, counter: 0, nodeId: 'node-a' },
    title: 'Default Task',
    priority: 1,
    done: false,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: buildEntityId('settings', '_', 'singleton'),
    createdAt: new Date('2025-06-01T10:00:00Z'),
    updatedAt: new Date('2025-06-01T10:00:00Z'),
    version: 1,
    device: 'dev-a',
    hlc: { timestamp: 1700000000000, counter: 0, nodeId: 'node-a' },
    theme: 'dark',
    locale: 'en-US',
    ...overrides,
  };
}

const taskDef = defineEntity<Task>('task', { keyStrategy: globalStrategy });
const settingsDef = defineEntity<AppSettings>('settings', { keyStrategy: singletonStrategy });

// ===========================================================================
// 1. Repository — CRUD + Querying
// ===========================================================================

describe('Sprint 003 Integration — Repository', () => {
  function setup() {
    const store = createEntityStore();
    const signal = createChangeSignal();
    const repo = createRepository(taskDef, store, signal);
    return { store, signal, repo };
  }

  it('saves and retrieves entities by id', () => {
    const { repo } = setup();
    const t1 = makeTask({ id: buildEntityId('task', '_', 'a') });
    const t2 = makeTask({ id: buildEntityId('task', '_', 'b'), title: 'Second', priority: 2 });
    repo.save(t1);
    repo.save(t2);

    expect(repo.get(t1.id)).toEqual(t1);
    expect(repo.get(t2.id)).toEqual(t2);
    expect(repo.get(buildEntityId('task', '_', 'nonexistent'))).toBeUndefined();
  });

  it('queries all entities with no options', () => {
    const { repo } = setup();
    const t1 = makeTask({ id: buildEntityId('task', '_', 'a') });
    const t2 = makeTask({ id: buildEntityId('task', '_', 'b'), title: 'B', priority: 5 });
    repo.save(t1);
    repo.save(t2);

    const all = repo.query();
    expect(all).toHaveLength(2);
  });

  it('filters with where clause (==)', () => {
    const { repo } = setup();
    repo.save(makeTask({ id: buildEntityId('task', '_', 'a'), priority: 1 }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'b'), priority: 2 }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'c'), priority: 1 }));

    const results = repo.query({ where: [{ field: 'priority', op: '==', value: 1 }] });
    expect(results).toHaveLength(2);
    results.forEach(r => expect(r.priority).toBe(1));
  });

  it('filters with where clause (>)', () => {
    const { repo } = setup();
    repo.save(makeTask({ id: buildEntityId('task', '_', 'a'), priority: 1 }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'b'), priority: 5 }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'c'), priority: 3 }));

    const results = repo.query({ where: [{ field: 'priority', op: '>', value: 2 }] });
    expect(results).toHaveLength(2);
    results.forEach(r => expect(r.priority).toBeGreaterThan(2));
  });

  it('filters with where clause (in)', () => {
    const { repo } = setup();
    repo.save(makeTask({ id: buildEntityId('task', '_', 'a'), priority: 1, title: 'A' }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'b'), priority: 2, title: 'B' }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'c'), priority: 3, title: 'C' }));

    const results = repo.query({ where: [{ field: 'title', op: 'in', value: ['A', 'C'] }] });
    expect(results).toHaveLength(2);
    expect(results.map(r => r.title).sort()).toEqual(['A', 'C']);
  });

  it('sorts with orderBy ascending', () => {
    const { repo } = setup();
    repo.save(makeTask({ id: buildEntityId('task', '_', 'c'), priority: 3, title: 'C' }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'a'), priority: 1, title: 'A' }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'b'), priority: 2, title: 'B' }));

    const results = repo.query({ orderBy: [{ field: 'priority', direction: 'asc' }] });
    expect(results.map(r => r.priority)).toEqual([1, 2, 3]);
  });

  it('sorts with orderBy descending', () => {
    const { repo } = setup();
    repo.save(makeTask({ id: buildEntityId('task', '_', 'a'), priority: 1 }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'b'), priority: 3 }));
    repo.save(makeTask({ id: buildEntityId('task', '_', 'c'), priority: 2 }));

    const results = repo.query({ orderBy: [{ field: 'priority', direction: 'desc' }] });
    expect(results.map(r => r.priority)).toEqual([3, 2, 1]);
  });

  it('applies limit', () => {
    const { repo } = setup();
    for (let i = 0; i < 5; i++) {
      repo.save(makeTask({ id: buildEntityId('task', '_', `t${i}`), priority: i }));
    }

    const results = repo.query({
      orderBy: [{ field: 'priority', direction: 'asc' }],
      limit: 3,
    });
    expect(results).toHaveLength(3);
    expect(results.map(r => r.priority)).toEqual([0, 1, 2]);
  });

  it('applies offset', () => {
    const { repo } = setup();
    for (let i = 0; i < 5; i++) {
      repo.save(makeTask({ id: buildEntityId('task', '_', `t${i}`), priority: i }));
    }

    const results = repo.query({
      orderBy: [{ field: 'priority', direction: 'asc' }],
      offset: 2,
    });
    expect(results).toHaveLength(3);
    expect(results.map(r => r.priority)).toEqual([2, 3, 4]);
  });

  it('applies limit + offset together', () => {
    const { repo } = setup();
    for (let i = 0; i < 10; i++) {
      repo.save(makeTask({ id: buildEntityId('task', '_', `t${i}`), priority: i }));
    }

    const results = repo.query({
      orderBy: [{ field: 'priority', direction: 'asc' }],
      limit: 3,
      offset: 4,
    });
    expect(results).toHaveLength(3);
    expect(results.map(r => r.priority)).toEqual([4, 5, 6]);
  });

  it('combines where + orderBy + limit', () => {
    const { repo } = setup();
    for (let i = 0; i < 10; i++) {
      repo.save(makeTask({ id: buildEntityId('task', '_', `t${i}`), priority: i, done: i % 2 === 0 }));
    }

    const results = repo.query({
      where: [{ field: 'done', op: '==', value: true }],
      orderBy: [{ field: 'priority', direction: 'desc' }],
      limit: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.priority).toBe(8);
    expect(results[1]!.priority).toBe(6);
  });

  it('deletes entities', () => {
    const { repo } = setup();
    const id = buildEntityId('task', '_', 'del-me');
    repo.save(makeTask({ id }));
    expect(repo.get(id)).toBeDefined();

    repo.delete(id);
    expect(repo.get(id)).toBeUndefined();
  });

  it('saveMany stores multiple entities', () => {
    const { repo } = setup();
    const tasks = [
      makeTask({ id: buildEntityId('task', '_', 'm1') }),
      makeTask({ id: buildEntityId('task', '_', 'm2') }),
      makeTask({ id: buildEntityId('task', '_', 'm3') }),
    ];
    repo.saveMany(tasks);
    expect(repo.query()).toHaveLength(3);
  });

  it('deleteMany removes multiple entities', () => {
    const { repo } = setup();
    const ids = ['dm1', 'dm2', 'dm3'].map(u => buildEntityId('task', '_', u));
    ids.forEach(id => repo.save(makeTask({ id })));
    expect(repo.query()).toHaveLength(3);

    repo.deleteMany([ids[0]!, ids[2]!]);
    expect(repo.query()).toHaveLength(1);
    expect(repo.get(ids[1]!)).toBeDefined();
  });
});

// ===========================================================================
// 2. SingletonRepository
// ===========================================================================

describe('Sprint 003 Integration — SingletonRepository', () => {
  function setup() {
    const store = createEntityStore();
    const signal = createChangeSignal();
    const repo = createSingletonRepository(settingsDef, store, signal);
    return { store, signal, repo };
  }

  it('get returns undefined when nothing saved', () => {
    const { repo } = setup();
    expect(repo.get()).toBeUndefined();
  });

  it('save + get returns the saved entity', () => {
    const { repo } = setup();
    const s = makeSettings();
    repo.save(s);
    expect(repo.get()).toEqual(s);
  });

  it('save replaces the previous entity', () => {
    const { repo } = setup();
    repo.save(makeSettings({ theme: 'dark' }));
    repo.save(makeSettings({ theme: 'light', version: 2 }));
    expect(repo.get()?.theme).toBe('light');
  });

  it('delete removes the entity', () => {
    const { repo } = setup();
    repo.save(makeSettings());
    expect(repo.get()).toBeDefined();
    repo.delete();
    expect(repo.get()).toBeUndefined();
  });

  it('observe emits current value and tracks changes', async () => {
    const { repo } = setup();
    const emissions: Array<AppSettings | undefined> = [];

    const obs$ = repo.observe().pipe(take(3), toArray());
    const done = firstValueFrom(obs$).then(vals => emissions.push(...vals));

    // 1st: initial undefined
    // 2nd: after save
    repo.save(makeSettings({ theme: 'blue' }));
    // 3rd: after delete
    repo.delete();

    await done;
    expect(emissions).toHaveLength(3);
    expect(emissions[0]).toBeUndefined();
    expect(emissions[1]?.theme).toBe('blue');
    expect(emissions[2]).toBeUndefined();
  });
});

// ===========================================================================
// 3. Repository — Observe
// ===========================================================================

describe('Sprint 003 Integration — Repository Observe', () => {
  function setup() {
    const store = createEntityStore();
    const signal = createChangeSignal();
    const repo = createRepository(taskDef, store, signal);
    return { repo };
  }

  it('observe(id) emits entity changes', async () => {
    const { repo } = setup();
    const id = buildEntityId('task', '_', 'obs1');
    const emissions: Array<Task | undefined> = [];

    const obs$ = repo.observe(id).pipe(take(3), toArray());
    const done = firstValueFrom(obs$).then(vals => emissions.push(...vals));

    // 1st: undefined (not yet saved)
    // 2nd: saved
    repo.save(makeTask({ id, title: 'Watched' }));
    // 3rd: deleted
    repo.delete(id);

    await done;
    expect(emissions).toHaveLength(3);
    expect(emissions[0]).toBeUndefined();
    expect(emissions[1]?.title).toBe('Watched');
    expect(emissions[2]).toBeUndefined();
  });

  it('observeQuery emits when matching set changes', async () => {
    const { repo } = setup();
    const emissions: Array<ReadonlyArray<Task>> = [];

    const obs$ = repo.observeQuery({
      where: [{ field: 'done', op: '==', value: true }],
    }).pipe(take(3), toArray());
    const done = firstValueFrom(obs$).then(vals => emissions.push(...vals));

    // 1st: empty array (no done tasks)
    // 2nd: one done task added
    repo.save(makeTask({ id: buildEntityId('task', '_', 'q1'), done: true }));
    // 3rd: a second done task
    repo.save(makeTask({ id: buildEntityId('task', '_', 'q2'), done: true, title: 'Two' }));

    await done;
    expect(emissions).toHaveLength(3);
    expect(emissions[0]).toHaveLength(0);
    expect(emissions[1]).toHaveLength(1);
    expect(emissions[2]).toHaveLength(2);
  });
});

// ===========================================================================
// 4. SyncScheduler — dedup behavior
// ===========================================================================

describe('Sprint 003 Integration — SyncScheduler', () => {
  it('runs first task immediately', async () => {
    const scheduler = createSyncScheduler();
    const log: string[] = [];
    await scheduler.schedule(async () => { log.push('first'); });
    expect(log).toEqual(['first']);
    scheduler.dispose();
  });

  it('serializes concurrent tasks', async () => {
    const scheduler = createSyncScheduler();
    const log: string[] = [];

    // First runs immediately; second queued while first runs
    const p1 = scheduler.schedule(async () => {
      log.push('start-1');
      await new Promise(r => setTimeout(r, 30));
      log.push('end-1');
    });
    const p2 = scheduler.schedule(async () => {
      log.push('start-2');
      log.push('end-2');
    });

    await Promise.all([p1, p2]);
    expect(log).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    scheduler.dispose();
  });

  it('deduplicates multiple pending schedules — only last fn executes', async () => {
    const scheduler = createSyncScheduler();
    const log: string[] = [];

    // First: runs immediately, takes some time
    const p1 = scheduler.schedule(async () => {
      await new Promise(r => setTimeout(r, 50));
      log.push('first');
    });

    // While first is running, schedule three more — only last should run
    const p2 = scheduler.schedule(async () => { log.push('second'); });
    const p3 = scheduler.schedule(async () => { log.push('third'); });
    const p4 = scheduler.schedule(async () => { log.push('fourth'); });

    await Promise.all([p1, p2, p3, p4]);
    expect(log).toEqual(['first', 'fourth']);
    scheduler.dispose();
  });

  it('dispose resolves pending without running', async () => {
    const scheduler = createSyncScheduler();
    const log: string[] = [];

    const p1 = scheduler.schedule(async () => {
      await new Promise(r => setTimeout(r, 50));
      log.push('running');
    });
    const p2 = scheduler.schedule(async () => { log.push('pending'); });

    scheduler.dispose();
    await Promise.all([p1, p2]);
    // pending should NOT have run
    expect(log).toContain('running');
    expect(log).not.toContain('pending');
  });
});

// ===========================================================================
// 5. Partition Diff — hash-based change detection
// ===========================================================================

describe('Sprint 003 Integration — Partition Diff', () => {
  function makeIndex(entries: Record<string, { hash: number; count: number }>): PartitionIndex {
    const idx: Record<string, { hash: number; count: number; updatedAt: string }> = {};
    for (const [k, v] of Object.entries(entries)) {
      idx[k] = { ...v, updatedAt: '2025-06-01T00:00:00Z' };
    }
    return idx;
  }

  it('detects added partitions (exist in cloud but not local)', () => {
    const local = makeIndex({ 'task._': { hash: 111, count: 1 } });
    const cloud = makeIndex({
      'task._': { hash: 111, count: 1 },
      'task.2025-07': { hash: 222, count: 2 },
    });
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.added).toEqual(['task.2025-07']);
    expect(diff.unchanged).toEqual(['task._']);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('detects removed partitions (exist locally but not in cloud)', () => {
    const local = makeIndex({
      'task._': { hash: 111, count: 1 },
      'old-part': { hash: 333, count: 1 },
    });
    const cloud = makeIndex({ 'task._': { hash: 111, count: 1 } });
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.removed).toEqual(['old-part']);
    expect(diff.added).toHaveLength(0);
  });

  it('detects changed partitions (hash differs)', () => {
    const local = makeIndex({ 'task._': { hash: 100, count: 2 } });
    const cloud = makeIndex({ 'task._': { hash: 999, count: 3 } });
    const diff = comparePartitionIndexes(local, cloud);
    expect(diff.changed).toEqual(['task._']);
    expect(diff.unchanged).toHaveLength(0);
  });

  it('marks identical partitions as unchanged', () => {
    const local = makeIndex({ a: { hash: 1, count: 1 }, b: { hash: 2, count: 2 } });
    const cloud = makeIndex({ a: { hash: 1, count: 1 }, b: { hash: 2, count: 2 } });
    const diff = comparePartitionIndexes(local, cloud);
    expect([...diff.unchanged].sort()).toEqual(['a', 'b']);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('uses computePartitionHash to detect real entity changes', () => {
    const e1: BaseEntity = makeTask({ id: 'x._.a1', hlc: { timestamp: 100, counter: 0, nodeId: 'n1' } });
    const e2: BaseEntity = makeTask({ id: 'x._.a1', hlc: { timestamp: 200, counter: 0, nodeId: 'n1' } });

    const hash1 = computePartitionHash([e1]);
    const hash2 = computePartitionHash([e2]);
    expect(hash1).not.toBe(hash2);

    // Same entity, same hash
    expect(computePartitionHash([e1])).toBe(hash1);
  });
});

// ===========================================================================
// 6. Merge — bidirectional with HLC conflict resolution
// ===========================================================================

describe('Sprint 003 Integration — Merge', () => {
  function hlc(ts: number, counter = 0, nodeId = 'n1'): Hlc {
    return { timestamp: ts, counter, nodeId };
  }

  function makeBlob(
    entities: Record<string, unknown>,
    deleted: Record<string, { id: string; hlc: Hlc; deletedAt: string }> = {},
  ): PartitionBlob {
    return { entities, deleted };
  }

  it('merges entities from both sides when no overlap', () => {
    const local = makeBlob({
      a: { id: 'a', hlc: hlc(100) },
    });
    const cloud = makeBlob({
      b: { id: 'b', hlc: hlc(200) },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect(Object.keys(merged.entities).sort()).toEqual(['a', 'b']);
    expect(Object.keys(merged.deleted)).toHaveLength(0);
  });

  it('picks higher-HLC entity on conflict (cloud wins)', () => {
    const local = makeBlob({
      x: { id: 'x', title: 'local', hlc: hlc(100) },
    });
    const cloud = makeBlob({
      x: { id: 'x', title: 'cloud', hlc: hlc(200) },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect((merged.entities['x'] as { title: string }).title).toBe('cloud');
  });

  it('picks higher-HLC entity on conflict (local wins)', () => {
    const local = makeBlob({
      x: { id: 'x', title: 'local', hlc: hlc(300) },
    });
    const cloud = makeBlob({
      x: { id: 'x', title: 'cloud', hlc: hlc(200) },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect((merged.entities['x'] as { title: string }).title).toBe('local');
  });

  it('uses counter as tiebreaker when timestamps equal', () => {
    const local = makeBlob({
      x: { id: 'x', title: 'local', hlc: hlc(100, 5, 'n1') },
    });
    const cloud = makeBlob({
      x: { id: 'x', title: 'cloud', hlc: hlc(100, 3, 'n2') },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect((merged.entities['x'] as { title: string }).title).toBe('local');
  });

  it('uses nodeId as final tiebreaker when timestamp+counter equal', () => {
    const local = makeBlob({
      x: { id: 'x', title: 'local', hlc: hlc(100, 0, 'zzz') },
    });
    const cloud = makeBlob({
      x: { id: 'x', title: 'cloud', hlc: hlc(100, 0, 'aaa') },
    });
    const merged = mergePartitionBlobs(local, cloud);
    // 'zzz' > 'aaa' so local wins
    expect((merged.entities['x'] as { title: string }).title).toBe('local');
  });

  it('tombstone with higher HLC wins over live entity', () => {
    const local = makeBlob({
      x: { id: 'x', title: 'alive', hlc: hlc(100) },
    });
    const cloud = makeBlob({}, {
      x: { id: 'x', hlc: hlc(200), deletedAt: '2025-06-01T00:00:00Z' },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect(merged.entities['x']).toBeUndefined();
    expect(merged.deleted['x']).toBeDefined();
    expect(merged.deleted['x']!.hlc.timestamp).toBe(200);
  });

  it('live entity with higher HLC wins over tombstone', () => {
    const local = makeBlob({
      x: { id: 'x', title: 'resurrected', hlc: hlc(300) },
    });
    const cloud = makeBlob({}, {
      x: { id: 'x', hlc: hlc(200), deletedAt: '2025-06-01T00:00:00Z' },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect(merged.entities['x']).toBeDefined();
    expect((merged.entities['x'] as { title: string }).title).toBe('resurrected');
    expect(merged.deleted['x']).toBeUndefined();
  });

  it('both-side tombstones — higher HLC tombstone wins', () => {
    const local = makeBlob({}, {
      x: { id: 'x', hlc: hlc(100), deletedAt: '2025-01-01T00:00:00Z' },
    });
    const cloud = makeBlob({}, {
      x: { id: 'x', hlc: hlc(200), deletedAt: '2025-06-01T00:00:00Z' },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect(merged.deleted['x']!.hlc.timestamp).toBe(200);
  });

  it('handles empty local blob', () => {
    const local = makeBlob({});
    const cloud = makeBlob({
      a: { id: 'a', hlc: hlc(100) },
      b: { id: 'b', hlc: hlc(200) },
    });
    const merged = mergePartitionBlobs(local, cloud);
    expect(Object.keys(merged.entities).sort()).toEqual(['a', 'b']);
  });

  it('handles empty cloud blob', () => {
    const local = makeBlob({
      a: { id: 'a', hlc: hlc(100) },
    });
    const cloud = makeBlob({});
    const merged = mergePartitionBlobs(local, cloud);
    expect(Object.keys(merged.entities)).toEqual(['a']);
  });
});

// ===========================================================================
// 7. Flush Mechanism — dirty tracking
// ===========================================================================

describe('Sprint 003 Integration — Flush Mechanism', () => {
  it('flushes dirty keys to writeBlob', async () => {
    const written: Array<{ key: string; blob: PartitionBlob }> = [];

    const getBlob = (key: string): PartitionBlob => ({
      entities: { x: { id: 'x', key } },
      deleted: {},
    });
    const writeBlob = async (key: string, blob: PartitionBlob) => {
      written.push({ key, blob });
    };

    const flush = createFlushMechanism(getBlob, writeBlob, 10);
    flush.markDirty('task._');
    flush.markDirty('notes._');

    await flush.flush();
    expect(written).toHaveLength(2);
    expect(written.map(w => w.key).sort()).toEqual(['notes._', 'task._']);
    await flush.dispose();
  });

  it('deduplicates multiple dirty marks for same key', async () => {
    let writeCount = 0;
    const getBlob = (): PartitionBlob => ({ entities: {}, deleted: {} });
    const writeBlob = async () => { writeCount++; };

    const flush = createFlushMechanism(getBlob, writeBlob, 10);
    flush.markDirty('task._');
    flush.markDirty('task._');
    flush.markDirty('task._');

    await flush.flush();
    expect(writeCount).toBe(1);
    await flush.dispose();
  });
});

// ===========================================================================
// 8. End-to-end: Repository → observe → sync roundtrip
// ===========================================================================

describe('Sprint 003 Integration — End-to-End Scenario', () => {
  it('app-like workflow: create tasks, query, observe, simulate sync merge', async () => {
    // Setup store + repo
    const store = createEntityStore();
    const signal = createChangeSignal();
    const repo = createRepository(taskDef, store, signal);

    // Create several tasks
    const tasks = [
      makeTask({ id: buildEntityId('task', '_', '1'), title: 'Buy milk', priority: 1, done: false }),
      makeTask({ id: buildEntityId('task', '_', '2'), title: 'Write code', priority: 3, done: false }),
      makeTask({ id: buildEntityId('task', '_', '3'), title: 'Deploy app', priority: 5, done: true }),
      makeTask({ id: buildEntityId('task', '_', '4'), title: 'Fix bug', priority: 2, done: false }),
      makeTask({ id: buildEntityId('task', '_', '5'), title: 'Code review', priority: 4, done: true }),
    ];
    repo.saveMany(tasks);

    // Query: high-priority undone tasks
    const urgent = repo.query({
      where: [
        { field: 'done', op: '==', value: false },
        { field: 'priority', op: '>=', value: 2 },
      ],
      orderBy: [{ field: 'priority', direction: 'desc' }],
    });
    expect(urgent.map(t => t.title)).toEqual(['Write code', 'Fix bug']);

    // Query: paginated done tasks
    const donePage = repo.query({
      where: [{ field: 'done', op: '==', value: true }],
      orderBy: [{ field: 'priority', direction: 'asc' }],
      limit: 1,
      offset: 0,
    });
    expect(donePage).toHaveLength(1);

    // Simulate merge: cloud has updated version of task 2
    const localBlob = makeBlob({
      [tasks[1]!.id]: { ...tasks[1]! },
    });
    const cloudBlob: PartitionBlob = {
      entities: {
        [tasks[1]!.id]: {
          ...tasks[1]!,
          title: 'Write MORE code',
          hlc: { timestamp: 1700000099999, counter: 0, nodeId: 'cloud-1' },
        },
      },
      deleted: {},
    };

    const merged = mergePartitionBlobs(localBlob, cloudBlob);
    const mergedEntity = merged.entities[tasks[1]!.id] as Task;
    expect(mergedEntity.title).toBe('Write MORE code');
  });
});

function makeBlob(
  entities: Record<string, unknown>,
  deleted: Record<string, { id: string; hlc: Hlc; deletedAt: string }> = {},
): PartitionBlob {
  return { entities, deleted };
}
