import type { BaseEntity } from '@strata/entity';
import type { EntityDefinition } from '@strata/schema';
import type { Repository, SingletonRepository } from '@strata/repository';
import type { ChangeSignal } from '@strata/reactive';
import { createChangeSignal } from '@strata/reactive';
import { createEntityStore } from '@strata/store';
import { serialize, deserialize, computePartitionHash } from '@strata/persistence';
import { createSyncEngine } from '@strata/sync';
import { createTenantManager } from '@strata/tenant';
import { createRepository, createSingletonRepository } from '@strata/repository';
import { MemoryBlobAdapter } from '@strata/adapter';
import type { Strata, StrataConfig } from './types.js';
import { validateConfig } from './validate-config.js';

export function createStrata(config: StrataConfig): Strata {
  validateConfig(config);

  const {
    entities,
    localAdapter,
    syncIntervalMs = 300_000,
    tombstoneRetentionDays = 90,
  } = config;
  const cloudAdapter = config.cloudAdapter ?? new MemoryBlobAdapter();

  const store = createEntityStore();

  // Create a change signal per entity type
  const signals = new Map<string, ChangeSignal>();
  for (const def of entities) {
    signals.set(def.name, createChangeSignal());
  }

  // Sync engine
  const syncEngine = createSyncEngine({
    localAdapter,
    cloudAdapter,
    store,
    serialize,
    deserialize,
    computeHash: computePartitionHash,
    periodicIntervalMs: syncIntervalMs,
    tombstoneRetentionDays,
  });

  // Tenant manager
  const tenantManager = createTenantManager(localAdapter, cloudAdapter);

  // Wrap store writes to trigger sync engine dirty tracking.
  // The raw store is passed to the sync engine (hydrate/merge must not mark dirty).
  // Repositories receive this tracked wrapper so user writes are tracked.
  const trackedStore: typeof store = {
    ...store,
    save(entityKey: string, entity: BaseEntity) {
      store.save(entityKey, entity);
      syncEngine.markDirty(entityKey);
    },
    saveMany(entityKey: string, entities: ReadonlyArray<BaseEntity>) {
      store.saveMany(entityKey, entities);
      syncEngine.markDirty(entityKey);
    },
    delete(entityKey: string, id: string) {
      store.delete(entityKey, id);
      syncEngine.markDirty(entityKey);
    },
    deleteMany(entityKey: string, ids: ReadonlyArray<string>) {
      store.deleteMany(entityKey, ids);
      syncEngine.markDirty(entityKey);
    },
  };

  // Repository cache
  const repoCache = new Map<string, Repository<any> | SingletonRepository<any>>();

  function repo<T extends BaseEntity>(
    def: EntityDefinition<T>,
  ): Repository<T> | SingletonRepository<T> {
    const cached = repoCache.get(def.name);
    if (cached) return cached;

    const signal = signals.get(def.name);
    if (!signal) {
      throw new Error(
        `Entity "${def.name}" was not registered in createStrata config`,
      );
    }

    let instance: Repository<T> | SingletonRepository<T>;
    if (def.keyStrategy.type === 'singleton') {
      instance = createSingletonRepository(def, trackedStore, signal);
    } else {
      instance = createRepository(def, trackedStore, signal);
    }

    repoCache.set(def.name, instance);
    return instance;
  }

  function sync(): Promise<void> {
    return syncEngine.sync();
  }

  async function dispose(): Promise<void> {
    syncEngine.stopPeriodicSync();
    await syncEngine.dispose();
    for (const signal of signals.values()) {
      signal.dispose();
    }
    tenantManager.dispose();
  }

  return {
    repo,
    tenants: tenantManager,
    sync,
    get isDirty() {
      return syncEngine.isDirty();
    },
    isDirty$: syncEngine.isDirty$,
    dispose,
  };
}
