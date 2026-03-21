import type { EntityDef } from '../schema/index.js';
import type { Repository } from '../repository/index.js';
import type { EntityEvent } from '../reactive/index.js';
import type { StrataConfig, Strata } from './strata-types.js';
import { createEntityStore } from '../store/index.js';
import { createEntityEventBus } from '../reactive/index.js';
import { createHlc } from '../hlc/index.js';
import { createDirtyTracker, createSyncScheduler } from '../sync/index.js';
import { createTenantManager, scopeStore } from '../tenant/index.js';
import { createRepository } from '../repository/index.js';
import type { Subscription } from 'rxjs';

export function createStrata(config: StrataConfig): Strata {
  const { entities, localAdapter, cloudAdapter, keyStrategy, deviceId } = config;

  validateEntityNames(entities);

  const store = createEntityStore();
  const eventBus = createEntityEventBus();
  createHlc(deviceId); // initialise clock for this node
  const dirtyTracker = createDirtyTracker();
  const syncScheduler = createSyncScheduler();
  const tenantManager = createTenantManager({ store, localAdapter, deviceId });

  const repoCache = new Map<string, Repository<unknown>>();
  let activeTenantId: string | undefined;
  const subscriptions: Subscription[] = [];
  let disposed = false;

  // Wire store mutations → dirty tracker + sync scheduler
  const storeListener = (event: EntityEvent) => {
    const entityKey = `${event.entityName}.${event.partitionKey}`;
    dirtyTracker.markDirty(entityKey);
    syncScheduler.schedule('store-to-local', entityKey);
  };
  eventBus.on(storeListener);

  // Track active tenant
  const tenantSub = tenantManager.activeTenant$.subscribe((tenant) => {
    activeTenantId = tenant?.id;
  });
  subscriptions.push(tenantSub);

  function ensureNotDisposed(): void {
    if (disposed) throw new Error('Strata instance has been disposed');
  }

  function ensureTenantLoaded(): string {
    if (!activeTenantId) {
      throw new Error('No tenant loaded. Call strata.load(tenantId) first.');
    }
    return activeTenantId;
  }

  return {
    repo<TName extends string, TFields>(
      def: EntityDef<TName, TFields>,
    ): Repository<TFields> {
      ensureNotDisposed();

      const cached = repoCache.get(def.name);
      if (cached) return cached as Repository<TFields>;

      if (!entities.some((e) => e.name === def.name)) {
        throw new Error(`Entity "${def.name}" is not registered in this Strata instance`);
      }

      const tenantId = ensureTenantLoaded();
      const scopedStore = scopeStore(store, tenantId, eventBus);

      const repo = createRepository({
        entityDef: def,
        store: scopedStore,
        eventBus,
        keyStrategy,
        deviceId,
        localAdapter,
        cloudAdapter,
      });

      repoCache.set(def.name, repo as Repository<unknown>);
      return repo;
    },

    async load(tenantId: string): Promise<void> {
      ensureNotDisposed();

      if (activeTenantId && activeTenantId !== tenantId) {
        repoCache.clear();
        dirtyTracker.clearAll();
        syncScheduler.flush();
      }

      await tenantManager.load(tenantId);
      repoCache.clear();
    },

    tenants: tenantManager,

    sync(): void {
      ensureNotDisposed();
      const tasks = syncScheduler.flush();
      // Actual sync execution will be wired in a future sprint
      // when full sync-cycle orchestration is implemented.
      // For now, flushing queued tasks captures the dirty→schedule flow.
      void tasks;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      eventBus.off(storeListener);
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
      subscriptions.length = 0;
      repoCache.clear();
      dirtyTracker.clearAll();
      syncScheduler.flush();
    },
  };
}

function validateEntityNames(
  entities: ReadonlyArray<EntityDef<string, unknown>>,
): void {
  const names = new Set<string>();
  for (const def of entities) {
    if (names.has(def.name)) {
      throw new Error(`Duplicate entity name: ${def.name}`);
    }
    names.add(def.name);
  }
}
