import { describe, it, expect } from 'vitest';

import { buildEntityId, parseEntityId, getEntityKey, deriveId } from '../../../src/entity/index.js';
import type { BaseEntity } from '../../../src/entity/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import type { EntityDefinition } from '../../../src/schema/index.js';
import { singleton, global, partitioned, monthlyPartition } from '../../../src/key-strategy/index.js';
import { createHlc, tickLocal, tickRemote, compareHlc } from '../../../src/hlc/index.js';
import type { Hlc } from '../../../src/hlc/index.js';
import { MemoryBlobAdapter } from '../../../src/adapter/index.js';

// ── App-level entity types ───────────────────────────────────────────

type TodoEntity = BaseEntity & {
  readonly title: string;
  readonly completed: boolean;
};

type SettingsEntity = BaseEntity & {
  readonly theme: 'light' | 'dark';
  readonly locale: string;
};

type LogEntry = BaseEntity & {
  readonly message: string;
  readonly level: 'info' | 'warn' | 'error';
};

// ── Helpers ──────────────────────────────────────────────────────────

function makeTodo(overrides: Partial<TodoEntity> & { title: string }): TodoEntity {
  return {
    id: overrides.id ?? 'todo._.' + Math.random().toString(36).slice(2, 8),
    createdAt: overrides.createdAt ?? new Date('2026-03-22T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-03-22T00:00:00Z'),
    version: overrides.version ?? 1,
    device: overrides.device ?? 'device-a',
    hlc: overrides.hlc ?? { timestamp: Date.now(), counter: 0, nodeId: 'device-a' },
    title: overrides.title,
    completed: overrides.completed ?? false,
  };
}

// ── Integration tests ────────────────────────────────────────────────

describe('Sprint 001 — Foundation modules integration', () => {
  // ── Entity ID lifecycle ────────────────────────────────────────────

  describe('Entity ID build → parse → getEntityKey round-trip', () => {
    it('builds an ID then parses it back to the same components', () => {
      const id = buildEntityId('todo', '2026-03', 'abc123');
      const parsed = parseEntityId(id);

      expect(parsed.entityName).toBe('todo');
      expect(parsed.partitionKey).toBe('2026-03');
      expect(parsed.uniqueId).toBe('abc123');
    });

    it('getEntityKey returns entityName.partitionKey', () => {
      const id = buildEntityId('todo', '2026-03', 'abc123');
      expect(getEntityKey(id)).toBe('todo.2026-03');
    });

    it('rejects dots in any segment', () => {
      expect(() => buildEntityId('to.do', '_', 'x')).toThrow();
      expect(() => buildEntityId('todo', 'a.b', 'x')).toThrow();
      expect(() => buildEntityId('todo', '_', 'a.b')).toThrow();
    });

    it('parseEntityId rejects malformed IDs', () => {
      expect(() => parseEntityId('only-two-parts.x')).toThrow();
      expect(() => parseEntityId('a.b.c.d')).toThrow();
    });
  });

  // ── deriveId ───────────────────────────────────────────────────────

  describe('deriveId produces deterministic IDs from entity fields', () => {
    it('derives a stable ID from title', () => {
      const derive = deriveId<TodoEntity>((e) => e.title.toLowerCase().replace(/\s+/g, '-'));
      const todo = makeTodo({ title: 'Buy Milk' });

      expect(derive(todo)).toBe('buy-milk');
      // Same entity → same derived ID
      expect(derive(todo)).toBe(derive(todo));
    });

    it('rejects derived IDs containing dots', () => {
      const derive = deriveId<TodoEntity>((e) => e.title);
      const todo = makeTodo({ title: 'v1.0' });

      expect(() => derive(todo)).toThrow(/dots/i);
    });
  });

  // ── defineEntity with key strategies ───────────────────────────────

  describe('defineEntity with different key strategies', () => {
    it('defaults to global strategy when no opts provided', () => {
      const def = defineEntity<TodoEntity>('todo');

      expect(def.name).toBe('todo');
      expect(def.keyStrategy.type).toBe('global');
      expect(def.deriveId).toBeUndefined();
    });

    it('uses singleton strategy for app settings', () => {
      const def = defineEntity<SettingsEntity>('settings', {
        keyStrategy: singleton,
      });

      expect(def.keyStrategy.type).toBe('singleton');
      const partitionKey = def.keyStrategy.getPartitionKey({} as SettingsEntity);
      expect(partitionKey).toBe('_');
    });

    it('uses partitioned strategy with custom function', () => {
      const byCompleted = partitioned<TodoEntity>((e) => (e.completed ? 'done' : 'active'));
      const def = defineEntity<TodoEntity>('todo', { keyStrategy: byCompleted });

      expect(def.keyStrategy.type).toBe('partitioned');

      const activeTodo = makeTodo({ title: 'Active', completed: false });
      const doneTodo = makeTodo({ title: 'Done', completed: true });

      expect(def.keyStrategy.getPartitionKey(activeTodo)).toBe('active');
      expect(def.keyStrategy.getPartitionKey(doneTodo)).toBe('done');
    });

    it('uses monthlyPartition based on createdAt', () => {
      const def = defineEntity<TodoEntity>('todo', {
        keyStrategy: monthlyPartition<TodoEntity>('createdAt'),
      });

      expect(def.keyStrategy.type).toBe('partitioned');

      const jan = makeTodo({ title: 'Jan task', createdAt: new Date('2026-01-15') });
      const dec = makeTodo({ title: 'Dec task', createdAt: new Date('2026-12-01') });

      expect(def.keyStrategy.getPartitionKey(jan)).toBe('2026-01');
      expect(def.keyStrategy.getPartitionKey(dec)).toBe('2026-12');
    });

    it('monthlyPartition throws when field is not a Date', () => {
      const strategy = monthlyPartition<Record<string, unknown>>('title');

      expect(() => strategy.getPartitionKey({ title: 'not a date' })).toThrow(/not a Date/);
    });

    it('uses defineEntity with deriveId', () => {
      const derive = deriveId<TodoEntity>((e) => e.title.toLowerCase().replace(/\s+/g, '-'));
      const def = defineEntity<TodoEntity>('todo', { deriveId: derive });

      expect(def.deriveId).toBeDefined();
      const todo = makeTodo({ title: 'Go Shopping' });
      expect(def.deriveId!(todo)).toBe('go-shopping');
    });
  });

  // ── Entity definition + buildEntityId end-to-end ───────────────────

  describe('Entity definition drives entity ID construction', () => {
    it('uses key strategy partition key when building entity IDs', () => {
      const def = defineEntity<TodoEntity>('todo', {
        keyStrategy: monthlyPartition<TodoEntity>('createdAt'),
      });

      const todo = makeTodo({ title: 'March task', createdAt: new Date('2026-03-22') });
      const partitionKey = def.keyStrategy.getPartitionKey(todo);
      const entityId = buildEntityId(def.name, partitionKey, 'unique-1');

      expect(entityId).toBe('todo.2026-03.unique-1');

      const parsed = parseEntityId(entityId);
      expect(parsed.entityName).toBe('todo');
      expect(parsed.partitionKey).toBe('2026-03');
      expect(parsed.uniqueId).toBe('unique-1');
    });

    it('uses deriveId as uniqueId when building entity IDs', () => {
      const derive = deriveId<TodoEntity>((e) => e.title.toLowerCase().replace(/\s+/g, '-'));
      const def = defineEntity<TodoEntity>('todo', {
        keyStrategy: global,
        deriveId: derive,
      });

      const todo = makeTodo({ title: 'Buy Milk' });
      const partitionKey = def.keyStrategy.getPartitionKey(todo);
      const uniqueId = def.deriveId!(todo);
      const entityId = buildEntityId(def.name, partitionKey, uniqueId);

      expect(entityId).toBe('todo._.buy-milk');
    });
  });

  // ── HLC ────────────────────────────────────────────────────────────

  describe('HLC clock operations', () => {
    it('creates an HLC with the correct nodeId', () => {
      const hlc = createHlc('device-a');

      expect(hlc.nodeId).toBe('device-a');
      expect(hlc.counter).toBe(0);
      expect(hlc.timestamp).toBeGreaterThan(0);
    });

    it('tickLocal advances the clock', () => {
      const hlc1 = createHlc('device-a');
      const hlc2 = tickLocal(hlc1);

      // tickLocal should produce a clock ≥ the original
      expect(compareHlc(hlc2, hlc1)).toBeGreaterThanOrEqual(0);
      expect(hlc2.nodeId).toBe('device-a');
    });

    it('tickRemote merges two device clocks', () => {
      const local = createHlc('device-a');
      const remote: Hlc = { timestamp: local.timestamp + 10000, counter: 5, nodeId: 'device-b' };

      const merged = tickRemote(local, remote);

      expect(merged.nodeId).toBe('device-a'); // keeps local nodeId
      expect(merged.timestamp).toBeGreaterThanOrEqual(remote.timestamp);
    });

    it('compareHlc orders clocks correctly', () => {
      const a: Hlc = { timestamp: 1000, counter: 0, nodeId: 'a' };
      const b: Hlc = { timestamp: 2000, counter: 0, nodeId: 'b' };

      expect(compareHlc(a, b)).toBeLessThan(0);
      expect(compareHlc(b, a)).toBeGreaterThan(0);
      expect(compareHlc(a, a)).toBe(0);
    });

    it('compareHlc breaks timestamp ties with counter, then nodeId', () => {
      const a: Hlc = { timestamp: 1000, counter: 1, nodeId: 'a' };
      const b: Hlc = { timestamp: 1000, counter: 2, nodeId: 'a' };

      expect(compareHlc(a, b)).toBeLessThan(0);

      const c: Hlc = { timestamp: 1000, counter: 1, nodeId: 'a' };
      const d: Hlc = { timestamp: 1000, counter: 1, nodeId: 'b' };

      expect(compareHlc(c, d)).toBeLessThan(0);
    });

    it('multiple tickLocal calls produce monotonically increasing clocks', () => {
      let hlc = createHlc('device-x');
      const clocks: Hlc[] = [hlc];

      for (let i = 0; i < 10; i++) {
        hlc = tickLocal(hlc);
        clocks.push(hlc);
      }

      for (let i = 1; i < clocks.length; i++) {
        expect(compareHlc(clocks[i]!, clocks[i - 1]!)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── MemoryBlobAdapter ──────────────────────────────────────────────

  describe('MemoryBlobAdapter blob CRUD operations', () => {
    it('write then read returns the same data', async () => {
      const adapter = new MemoryBlobAdapter();
      const data = new TextEncoder().encode('{"title":"Buy Milk"}');

      await adapter.write(undefined, 'todo/2026-03/abc.json', data);
      const result = await adapter.read(undefined, 'todo/2026-03/abc.json');

      expect(result).not.toBeNull();
      expect(new TextDecoder().decode(result!)).toBe('{"title":"Buy Milk"}');
    });

    it('read returns null for non-existent path', async () => {
      const adapter = new MemoryBlobAdapter();
      const result = await adapter.read(undefined, 'does/not/exist.json');

      expect(result).toBeNull();
    });

    it('delete removes a blob', async () => {
      const adapter = new MemoryBlobAdapter();
      const data = new TextEncoder().encode('temp');

      await adapter.write(undefined, 'temp.json', data);
      await adapter.delete(undefined, 'temp.json');

      const result = await adapter.read(undefined, 'temp.json');
      expect(result).toBeNull();
    });

    it('list returns only paths matching prefix', async () => {
      const adapter = new MemoryBlobAdapter();
      const data = new TextEncoder().encode('x');

      await adapter.write(undefined, 'todo/2026-01/a.json', data);
      await adapter.write(undefined, 'todo/2026-01/b.json', data);
      await adapter.write(undefined, 'todo/2026-02/c.json', data);
      await adapter.write(undefined, 'settings/config.json', data);

      const janBlobs = await adapter.list(undefined, 'todo/2026-01/');
      expect(janBlobs).toHaveLength(2);
      expect(janBlobs).toContain('todo/2026-01/a.json');
      expect(janBlobs).toContain('todo/2026-01/b.json');

      const allTodos = await adapter.list(undefined, 'todo/');
      expect(allTodos).toHaveLength(3);

      const allSettings = await adapter.list(undefined, 'settings/');
      expect(allSettings).toHaveLength(1);
    });

    it('list returns empty array when no blobs match', async () => {
      const adapter = new MemoryBlobAdapter();

      const result = await adapter.list(undefined, 'nothing/');
      expect(result).toEqual([]);
    });
  });

  // ── End-to-end: define entity, derive key, build ID, store blob ───

  describe('End-to-end: entity lifecycle with blob storage', () => {
    it('defines entity, computes partition + ID, serializes to blob, reads back', async () => {
      const derive = deriveId<TodoEntity>((e) => e.title.toLowerCase().replace(/\s+/g, '-'));
      const def = defineEntity<TodoEntity>('todo', {
        keyStrategy: monthlyPartition<TodoEntity>('createdAt'),
        deriveId: derive,
      });

      const todo = makeTodo({ title: 'Write Tests', createdAt: new Date('2026-03-22') });
      const partitionKey = def.keyStrategy.getPartitionKey(todo);
      const uniqueId = def.deriveId!(todo);
      const entityId = buildEntityId(def.name, partitionKey, uniqueId);

      expect(entityId).toBe('todo.2026-03.write-tests');

      // Serialize and store via MemoryBlobAdapter
      const adapter = new MemoryBlobAdapter();
      const entityKey = getEntityKey(entityId);
      const blobPath = `${entityKey.replace('.', '/')}/${uniqueId}.json`;
      const blob = new TextEncoder().encode(JSON.stringify(todo));

      await adapter.write(undefined, blobPath, blob);

      // Read back and verify
      const raw = await adapter.read(undefined, blobPath);
      expect(raw).not.toBeNull();
      const restored = JSON.parse(new TextDecoder().decode(raw!));
      expect(restored.title).toBe('Write Tests');
      expect(restored.completed).toBe(false);

      // List blobs in partition
      const blobs = await adapter.list(undefined, 'todo/2026-03/');
      expect(blobs).toContain(blobPath);
    });

    it('HLC clock state accompanies entity through storage round-trip', async () => {
      const hlc = createHlc('device-a');
      const ticked = tickLocal(hlc);

      const todo = makeTodo({
        title: 'HLC test',
        hlc: { timestamp: ticked.timestamp, counter: ticked.counter, nodeId: ticked.nodeId },
      });

      const adapter = new MemoryBlobAdapter();
      const blob = new TextEncoder().encode(JSON.stringify(todo));
      await adapter.write(undefined, 'todo/_/hlc-test.json', blob);

      const raw = await adapter.read(undefined, 'todo/_/hlc-test.json');
      const restored = JSON.parse(new TextDecoder().decode(raw!));

      expect(restored.hlc.nodeId).toBe('device-a');
      expect(restored.hlc.timestamp).toBe(ticked.timestamp);
      expect(restored.hlc.counter).toBe(ticked.counter);
    });
  });
});
