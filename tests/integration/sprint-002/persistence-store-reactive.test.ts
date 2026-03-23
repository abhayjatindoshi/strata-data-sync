import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  fnvHash,
  computePartitionHash,
} from '@strata/persistence';
import { createEntityStore } from '@strata/store';
import {
  createChangeSignal,
  observe,
  observeQuery,
  entityArrayEquals,
  createEventBus,
} from '@strata/reactive';
import {
  gzip,
  applyEncodeTransforms,
  applyDecodeTransforms,
} from '@strata/adapter';
import type { BaseEntity } from '@strata/entity';
import { firstValueFrom, take, toArray } from 'rxjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(overrides: Partial<BaseEntity> = {}): BaseEntity {
  return {
    id: 'e1',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    updatedAt: new Date('2025-01-15T12:00:00Z'),
    version: 1,
    device: 'device-a',
    hlc: { timestamp: 1700000000000, counter: 0, nodeId: 'node-a' },
    ...overrides,
  };
}

// ===========================================================================
// 1. JSON serialization round-trips with Date type markers
// ===========================================================================

describe('Sprint 002 Integration — Serialization', () => {
  it('round-trips a BaseEntity with Date fields preserved', () => {
    const entity = makeEntity();
    const json = serialize(entity);
    const restored = deserialize(json) as BaseEntity;

    expect(restored.id).toBe(entity.id);
    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.updatedAt).toBeInstanceOf(Date);
    expect(restored.createdAt.getTime()).toBe(entity.createdAt.getTime());
    expect(restored.updatedAt.getTime()).toBe(entity.updatedAt.getTime());
    expect(restored.version).toBe(entity.version);
    expect(restored.hlc).toEqual(entity.hlc);
  });

  it('serializes Date as type marker { __t: "D", v: iso }', () => {
    const date = new Date('2025-06-01T00:00:00Z');
    const json = serialize({ when: date });
    const parsed = JSON.parse(json);
    expect(parsed.when).toEqual({ __t: 'D', v: '2025-06-01T00:00:00.000Z' });
  });

  it('round-trips nested objects containing Dates', () => {
    const data = {
      items: [
        { name: 'a', ts: new Date('2024-01-01T00:00:00Z') },
        { name: 'b', ts: new Date('2024-06-15T12:30:00Z') },
      ],
    };
    const restored = deserialize(serialize(data)) as typeof data;
    expect(restored.items[0]!.ts).toBeInstanceOf(Date);
    expect(restored.items[1]!.ts.toISOString()).toBe('2024-06-15T12:30:00.000Z');
  });

  it('preserves non-Date primitives unchanged', () => {
    const data = { num: 42, str: 'hello', flag: true, nil: null };
    const restored = deserialize(serialize(data));
    expect(restored).toEqual(data);
  });
});

// ===========================================================================
// 2. FNV-1a hashing & partition hash
// ===========================================================================

describe('Sprint 002 Integration — Hashing', () => {
  it('fnvHash produces a consistent unsigned 32-bit integer', () => {
    const hash = fnvHash('test-input');
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
    expect(fnvHash('test-input')).toBe(hash); // deterministic
  });

  it('fnvHash produces different values for different inputs', () => {
    expect(fnvHash('alpha')).not.toBe(fnvHash('beta'));
  });

  it('computePartitionHash is order-independent (sorts by id)', () => {
    const e1 = makeEntity({ id: 'aaa' });
    const e2 = makeEntity({ id: 'bbb', version: 2 });

    const hashAB = computePartitionHash([e1, e2]);
    const hashBA = computePartitionHash([e2, e1]);
    expect(hashAB).toBe(hashBA);
  });

  it('computePartitionHash changes when HLC changes', () => {
    const e1 = makeEntity({ id: 'x' });
    const e2 = makeEntity({
      id: 'x',
      hlc: { timestamp: 9999999999999, counter: 5, nodeId: 'node-b' },
    });

    expect(computePartitionHash([e1])).not.toBe(computePartitionHash([e2]));
  });
});

// ===========================================================================
// 3. Store CRUD across partitions
// ===========================================================================

describe('Sprint 002 Integration — Store CRUD', () => {
  it('save → get returns the entity', () => {
    const store = createEntityStore();
    const entity = makeEntity();
    store.save('todo', entity);

    expect(store.get('todo', 'e1')).toBe(entity);
  });

  it('getAll returns all entities in a partition', () => {
    const store = createEntityStore();
    const e1 = makeEntity({ id: 'a' });
    const e2 = makeEntity({ id: 'b' });
    store.save('todo', e1);
    store.save('todo', e2);

    const all = store.getAll('todo');
    expect(all).toHaveLength(2);
    expect(all.map(e => e.id).sort()).toEqual(['a', 'b']);
  });

  it('save overwrites an entity with the same id', () => {
    const store = createEntityStore();
    store.save('todo', makeEntity({ id: 'x', version: 1 }));
    store.save('todo', makeEntity({ id: 'x', version: 2 }));

    expect(store.get('todo', 'x')?.version).toBe(2);
    expect(store.getAll('todo')).toHaveLength(1);
  });

  it('delete removes a single entity', () => {
    const store = createEntityStore();
    store.save('todo', makeEntity({ id: 'a' }));
    store.save('todo', makeEntity({ id: 'b' }));
    store.delete('todo', 'a');

    expect(store.get('todo', 'a')).toBeUndefined();
    expect(store.getAll('todo')).toHaveLength(1);
  });

  it('get returns undefined for unknown key', () => {
    const store = createEntityStore();
    expect(store.get('todo', 'nope')).toBeUndefined();
  });

  it('saveMany bulk-inserts entities', () => {
    const store = createEntityStore();
    const entities = [makeEntity({ id: 'a' }), makeEntity({ id: 'b' }), makeEntity({ id: 'c' })];
    store.saveMany('note', entities);

    expect(store.getAll('note')).toHaveLength(3);
  });

  it('deleteMany removes multiple entities', () => {
    const store = createEntityStore();
    store.saveMany('note', [
      makeEntity({ id: 'a' }),
      makeEntity({ id: 'b' }),
      makeEntity({ id: 'c' }),
    ]);
    store.deleteMany('note', ['a', 'c']);

    expect(store.getAll('note')).toHaveLength(1);
    expect(store.get('note', 'b')).toBeDefined();
  });

  it('operates independently across different entity keys', () => {
    const store = createEntityStore();
    store.save('todo', makeEntity({ id: 'x' }));
    store.save('note', makeEntity({ id: 'x' }));

    store.delete('todo', 'x');
    expect(store.get('todo', 'x')).toBeUndefined();
    expect(store.get('note', 'x')).toBeDefined();
  });
});

// ===========================================================================
// 4. Partition tracking (listPartitions, hasPartition)
// ===========================================================================

describe('Sprint 002 Integration — Partition tracking', () => {
  it('hasPartition returns false before any save', () => {
    const store = createEntityStore();
    expect(store.hasPartition('todo')).toBe(false);
  });

  it('hasPartition returns true after a save', () => {
    const store = createEntityStore();
    store.save('todo', makeEntity());
    expect(store.hasPartition('todo')).toBe(true);
  });

  it('listPartitions finds all partitions for an entity name', () => {
    const store = createEntityStore();
    store.save('todo.2025-01', makeEntity({ id: 'a' }));
    store.save('todo.2025-02', makeEntity({ id: 'b' }));
    store.save('note.2025-01', makeEntity({ id: 'c' }));

    const todoPartitions = store.listPartitions('todo');
    expect(todoPartitions).toHaveLength(2);
    expect([...todoPartitions].sort()).toEqual(['todo.2025-01', 'todo.2025-02']);

    expect(store.listPartitions('note')).toHaveLength(1);
    expect(store.listPartitions('unknown')).toHaveLength(0);
  });
});

// ===========================================================================
// 5. Reactive — observe / observeQuery with distinctUntilChanged
// ===========================================================================

describe('Sprint 002 Integration — Reactive observe', () => {
  it('observe emits the initial value immediately', async () => {
    const signal = createChangeSignal();
    const value = await firstValueFrom(observe(signal, () => 42));
    expect(value).toBe(42);
    signal.dispose();
  });

  it('observe emits new value after signal.notify()', async () => {
    const signal = createChangeSignal();
    let counter = 0;
    const values$ = observe(signal, () => ++counter).pipe(take(3), toArray());

    // After subscribing, the pipe emits initial (1).
    // Then we trigger two more notifications.
    setTimeout(() => signal.notify(), 5);
    setTimeout(() => signal.notify(), 10);

    const values = await firstValueFrom(values$);
    expect(values).toEqual([1, 2, 3]);
    signal.dispose();
  });

  it('observe suppresses duplicates via distinctUntilChanged', async () => {
    const signal = createChangeSignal();
    let val = 'A';
    const emitted: string[] = [];

    const sub = observe(signal, () => val).subscribe(v => emitted.push(v));

    // Notify but return the same value — should NOT emit again
    signal.notify();
    // Give micro-tasks time to flush
    await new Promise(r => setTimeout(r, 20));

    expect(emitted).toEqual(['A']); // only the initial emit
    sub.unsubscribe();
    signal.dispose();
  });

  it('observe emits when value changes', async () => {
    const signal = createChangeSignal();
    let val = 'A';
    const emitted: string[] = [];

    const sub = observe(signal, () => val).subscribe(v => emitted.push(v));

    val = 'B';
    signal.notify();
    await new Promise(r => setTimeout(r, 20));

    expect(emitted).toEqual(['A', 'B']);
    sub.unsubscribe();
    signal.dispose();
  });

  it('observeQuery works with entityArrayEquals as comparator', async () => {
    const signal = createChangeSignal();
    const store = createEntityStore();
    store.save('todo', makeEntity({ id: 'a', version: 1 }));

    const emitted: number[] = [];

    const sub = observeQuery(
      signal,
      () => store.getAll('todo'),
      entityArrayEquals,
    ).subscribe(arr => emitted.push(arr.length));

    // Re-notify without changing data — should NOT emit again
    signal.notify();
    await new Promise(r => setTimeout(r, 20));
    expect(emitted).toEqual([1]);

    // Now actually change data
    store.save('todo', makeEntity({ id: 'b', version: 1 }));
    signal.notify();
    await new Promise(r => setTimeout(r, 20));
    expect(emitted).toEqual([1, 2]);

    sub.unsubscribe();
    signal.dispose();
  });
});

// ===========================================================================
// 6. Event bus on/off/emit
// ===========================================================================

describe('Sprint 002 Integration — Event bus', () => {
  it('emits events to registered listeners', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('save', () => calls.push('save-handler'));
    bus.emit('save');
    expect(calls).toEqual(['save-handler']);
    bus.dispose();
  });

  it('supports multiple listeners on one event', () => {
    const bus = createEventBus();
    const calls: number[] = [];
    bus.on('change', () => calls.push(1));
    bus.on('change', () => calls.push(2));
    bus.emit('change');
    expect(calls).toEqual([1, 2]);
    bus.dispose();
  });

  it('off removes a specific listener', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const handler = () => calls.push('x');
    bus.on('change', handler);
    bus.off('change', handler);
    bus.emit('change');
    expect(calls).toEqual([]);
    bus.dispose();
  });

  it('different event types are independent', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('save', () => calls.push('save'));
    bus.on('delete', () => calls.push('delete'));
    bus.emit('save');
    expect(calls).toEqual(['save']);
    bus.dispose();
  });

  it('dispose clears all listeners', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('save', () => calls.push('x'));
    bus.dispose();
    bus.emit('save');
    expect(calls).toEqual([]);
  });
});

// ===========================================================================
// 7. Transform pipeline — gzip round-trip
// ===========================================================================

describe('Sprint 002 Integration — Transform pipeline', () => {
  it('gzip encode → decode round-trips binary data', async () => {
    const original = new TextEncoder().encode('Hello, Strata!');
    const g = gzip();

    const compressed = await g.encode(original);
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = await g.decode(compressed);
    expect(new TextDecoder().decode(decompressed)).toBe('Hello, Strata!');
  });

  it('applyEncodeTransforms / applyDecodeTransforms with gzip', async () => {
    const text = JSON.stringify(makeEntity());
    const original = new TextEncoder().encode(text);

    const transforms = [gzip()];

    const encoded = await applyEncodeTransforms(transforms, original);
    const decoded = await applyDecodeTransforms(transforms, encoded);
    expect(new TextDecoder().decode(decoded)).toBe(text);
  });

  it('gzip compresses larger payloads to smaller size', async () => {
    const big = new TextEncoder().encode('x'.repeat(10_000));
    const compressed = await gzip().encode(big);
    expect(compressed.length).toBeLessThan(big.length);
  });
});

// ===========================================================================
// 8. End-to-end: serialize → store → observe → hash
// ===========================================================================

describe('Sprint 002 Integration — End-to-end flow', () => {
  it('serialize entity → save to store → observe changes → compute hash', async () => {
    // 1. Serialize round-trip
    const entity = makeEntity({ id: 'todo-1', version: 1 });
    const json = serialize(entity);
    const restored = deserialize(json) as BaseEntity;
    expect(restored.createdAt).toBeInstanceOf(Date);

    // 2. Store it
    const store = createEntityStore();
    store.save('todo', restored);
    expect(store.get('todo', 'todo-1')).toBeDefined();

    // 3. Observe changes
    const signal = createChangeSignal();
    const emitted: number[] = [];
    const sub = observeQuery(
      signal,
      () => store.getAll('todo'),
      entityArrayEquals,
    ).subscribe(arr => emitted.push(arr.length));

    // Add another entity and notify
    store.save('todo', makeEntity({ id: 'todo-2', version: 1 }));
    signal.notify();
    await new Promise(r => setTimeout(r, 20));

    expect(emitted).toEqual([1, 2]);

    // 4. Compute partition hash
    const allEntities = store.getAll('todo');
    const hash = computePartitionHash(allEntities);
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThan(0);

    sub.unsubscribe();
    signal.dispose();
  });
});
