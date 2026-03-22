import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { MemoryBlobAdapter } from '../adapter/index.js';
import { createEntityStore } from '../store/index.js';
import { serialize, deserialize, computePartitionHash } from '../persistence/index.js';
import type { PartitionBlob, PartitionIndex } from '../persistence/index.js';
import type { BaseEntity } from '../entity/index.js';
import { createSyncEngine } from './sync-engine.js';
import type { SyncEngineConfig } from './types.js';

const encoder = new TextEncoder();

function encode(data: unknown): Uint8Array {
  return encoder.encode(serialize(data));
}

function makeEntity(id: string, ts: number, counter = 0): BaseEntity {
  return {
    id,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    version: 1,
    device: 'test',
    hlc: { timestamp: ts, counter, nodeId: 'n1' },
  };
}

function makeConfig(
  overrides: Partial<SyncEngineConfig> = {},
): SyncEngineConfig {
  return {
    localAdapter: new MemoryBlobAdapter(),
    cloudAdapter: new MemoryBlobAdapter(),
    store: createEntityStore(),
    serialize,
    deserialize,
    computeHash: computePartitionHash,
    ...overrides,
  };
}

async function seedAdapter(
  adapter: MemoryBlobAdapter,
  blobs: Record<string, PartitionBlob>,
  cloudMeta?: Readonly<Record<string, unknown>>,
): Promise<void> {
  const idx: PartitionIndex = {};
  for (const [key, blob] of Object.entries(blobs)) {
    await adapter.write(cloudMeta, key, encode(blob));
    const entities = Object.values(blob.entities) as BaseEntity[];
    idx[key] = {
      hash: computePartitionHash(entities),
      count: entities.length,
      updatedAt: new Date().toISOString(),
    };
  }
  await adapter.write(cloudMeta, '__partition_index', encode(idx));
}

describe('createSyncEngine', () => {
  let local: MemoryBlobAdapter;
  let cloud: MemoryBlobAdapter;
  let store: ReturnType<typeof createEntityStore>;

  beforeEach(() => {
    local = new MemoryBlobAdapter();
    cloud = new MemoryBlobAdapter();
    store = createEntityStore();
  });

  describe('hydrate', () => {
    it('loads cloud data into store on hydrate', async () => {
      const e1 = makeEntity('e1', 1000);
      await seedAdapter(cloud, {
        'task._': { entities: { e1 }, deleted: {} },
      });

      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));
      await engine.hydrate();

      expect(store.get('task._', 'e1')).toBeDefined();
      await engine.dispose();
    });

    it('emits cloud-unreachable when cloud fails', async () => {
      const failCloud = new MemoryBlobAdapter();
      vi.spyOn(failCloud, 'read').mockRejectedValue(new Error('offline'));

      const events: string[] = [];
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: failCloud,
        store,
      }));
      engine.onEvent('cloud-unreachable', () => events.push('unreachable'));

      // Seed local so hydrate has something
      await seedAdapter(local, {
        'task._': {
          entities: { e1: makeEntity('e1', 1000) },
          deleted: {},
        },
      });

      await engine.hydrate();
      expect(events).toContain('unreachable');
      expect(store.get('task._', 'e1')).toBeDefined();
      await engine.dispose();
    });

    it('merges cloud and local data on hydrate', async () => {
      const localEntity = makeEntity('e1', 1000);
      const cloudEntity = makeEntity('e2', 2000);
      await seedAdapter(local, {
        'task._': { entities: { e1: localEntity }, deleted: {} },
      });
      await seedAdapter(cloud, {
        'task._': { entities: { e2: cloudEntity }, deleted: {} },
      });

      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));
      await engine.hydrate();

      expect(store.get('task._', 'e1')).toBeDefined();
      expect(store.get('task._', 'e2')).toBeDefined();
      await engine.dispose();
    });
  });

  describe('sync', () => {
    it('syncs local changes to cloud', async () => {
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));

      const e1 = makeEntity('e1', 1000);
      store.save('task._', e1);
      // Write to local adapter so sync can find it
      await local.write(undefined, 'task._', encode({
        entities: { e1 },
        deleted: {},
      }));
      await local.write(undefined, '__partition_index', encode({
        'task._': { hash: 111, count: 1, updatedAt: new Date().toISOString() },
      }));

      await engine.sync();

      const cloudRaw = await cloud.read(undefined, 'task._');
      expect(cloudRaw).not.toBeNull();
      await engine.dispose();
    });

    it('emits started and completed events', async () => {
      const events: string[] = [];
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));
      engine.onEvent('started', () => events.push('started'));
      engine.onEvent('completed', () => events.push('completed'));

      await engine.sync();

      expect(events).toContain('started');
      expect(events).toContain('completed');
      await engine.dispose();
    });

    it('copies cloud-only partitions to local (copy optimization)', async () => {
      await seedAdapter(cloud, {
        'note._': {
          entities: { n1: makeEntity('n1', 3000) },
          deleted: {},
        },
      });
      // local has empty index
      await local.write(undefined, '__partition_index', encode({}));

      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));
      await engine.sync();

      const localBlob = await local.read(undefined, 'note._');
      expect(localBlob).not.toBeNull();
      expect(store.get('note._', 'n1')).toBeDefined();
      await engine.dispose();
    });
  });

  describe('isDirty', () => {
    it('starts as false', () => {
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));
      expect(engine.isDirty()).toBe(false);
    });
  });

  describe('periodic sync', () => {
    it('can start and stop periodic sync', async () => {
      vi.useFakeTimers();
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
        periodicIntervalMs: 1000,
      }));

      engine.startPeriodicSync();
      engine.stopPeriodicSync();
      vi.useRealTimers();
      await engine.dispose();
    });
  });

  describe('dispose', () => {
    it('completes isDirty$ on dispose', async () => {
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));

      const values = firstValueFrom(
        engine.isDirty$.pipe(take(1), toArray()),
      );
      await engine.dispose();
      const result = await values;
      expect(result).toBeDefined();
    });
  });

  describe('event listeners', () => {
    it('can remove event listeners', async () => {
      const events: string[] = [];
      const engine = createSyncEngine(makeConfig({
        localAdapter: local,
        cloudAdapter: cloud,
        store,
      }));
      const listener = () => events.push('started');
      engine.onEvent('started', listener);
      engine.offEvent('started', listener);

      await engine.sync();
      expect(events).not.toContain('started');
      await engine.dispose();
    });
  });
});
