import debug from 'debug';
import type { Observable } from 'rxjs';
import { createHlc } from '@strata/hlc';
import type { Hlc } from '@strata/hlc';
import type { BlobAdapter } from '@strata/adapter';
import type { EntityDefinition } from '@strata/schema';
import { createEventBus } from '@strata/reactive';
import { createStore, createFlushScheduler } from '@strata/store';
import { createRepository, createSingletonRepository } from '@strata/repo';
import type { Repository, SingletonRepository } from '@strata/repo';
import { createTenantManager } from '@strata/tenant';
import type { TenantManager } from '@strata/tenant';
import {
  createSyncLock, createSyncEventEmitter, createDirtyTracker,
  createSyncScheduler, syncNow, hydrateFromCloud, hydrateFromLocal,
} from '@strata/sync';
import type {
  SyncResult, SyncEventListener, SyncScheduler,
} from '@strata/sync';

const log = debug('strata:core');

// ─── Types ───────────────────────────────────────────────

export type StrataOptions = {
  readonly flushDebounceMs?: number;
  readonly cloudSyncIntervalMs?: number;
  readonly localFlushIntervalMs?: number;
  readonly tombstoneRetentionMs?: number;
};

export type StrataConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly entities: ReadonlyArray<EntityDefinition<any>>;
  readonly localAdapter: BlobAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly deviceId: string;
  readonly options?: StrataOptions;
};

export type Strata = {
  readonly tenants: TenantManager;
  repo<T>(def: EntityDefinition<T>): Repository<T> | SingletonRepository<T>;
  sync(): Promise<SyncResult>;
  dispose(): Promise<void>;
  readonly isDirty: boolean;
  readonly isDirty$: Observable<boolean>;
  onSyncEvent(listener: SyncEventListener): void;
  offSyncEvent(listener: SyncEventListener): void;
};

// ─── Validation ──────────────────────────────────────────

export function validateEntityDefinitions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: ReadonlyArray<EntityDefinition<any>>,
): void {
  if (entities.length === 0) {
    throw new Error('At least one entity definition is required');
  }
  const names = new Set<string>();
  for (const def of entities) {
    if (!def.name) {
      throw new Error('Entity definition must have a name');
    }
    if (names.has(def.name)) {
      throw new Error(`Duplicate entity name: ${def.name}`);
    }
    names.add(def.name);
  }
}

// ─── Factory ─────────────────────────────────────────────

export function createStrata(config: StrataConfig): Strata {
  validateEntityDefinitions(config.entities);

  const hlcRef: { current: Hlc } = { current: createHlc(config.deviceId) };
  const eventBus = createEventBus();
  const store = createStore();
  const flushScheduler = createFlushScheduler(
    config.localAdapter, undefined, store,
    { debounceMs: config.options?.flushDebounceMs },
  );
  const syncLock = createSyncLock();
  const syncEvents = createSyncEventEmitter();
  const dirtyTracker = createDirtyTracker();
  const entityNames = config.entities.map(d => d.name);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repoMap = new Map<string, Repository<any> | SingletonRepository<any>>();
  for (const def of config.entities) {
    if (def.keyStrategy.kind === 'singleton') {
      repoMap.set(def.name, createSingletonRepository(def, store, hlcRef, eventBus));
    } else {
      repoMap.set(def.name, createRepository(def, store, hlcRef, eventBus));
    }
  }

  const baseTenants = createTenantManager(config.localAdapter, {
    entityTypes: entityNames,
  });

  let syncScheduler: SyncScheduler | null = null;
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  const dirtyFlushListener = () => {
    dirtyTracker.markDirty();
    flushScheduler.schedule();
  };
  eventBus.on(dirtyFlushListener);

  function assertNotDisposed(): void {
    if (disposed) throw new Error('Strata instance is disposed');
  }

  const tenants: TenantManager = {
    list: () => baseTenants.list(),
    create: (opts) => baseTenants.create(opts),
    setup: (opts) => baseTenants.setup(opts),
    delink: (id) => baseTenants.delink(id),
    delete: (id) => baseTenants.delete(id),
    activeTenant$: baseTenants.activeTenant$,
    async load(tenantId) {
      assertNotDisposed();
      await baseTenants.load(tenantId);
      const tenant = baseTenants.activeTenant$.getValue();
      if (!tenant) return;

      if (syncScheduler) {
        syncScheduler.stop();
        syncScheduler = null;
      }

      if (config.cloudAdapter) {
        try {
          await hydrateFromCloud(
            config.cloudAdapter, config.localAdapter,
            store, entityNames, tenant.cloudMeta,
          );
        } catch {
          syncEvents.emit({ type: 'cloud-unreachable' });
          await hydrateFromLocal(config.localAdapter, store, entityNames);
        }
      } else {
        await hydrateFromLocal(config.localAdapter, store, entityNames);
      }

      if (config.cloudAdapter) {
        syncScheduler = createSyncScheduler(
          syncLock, config.localAdapter, config.cloudAdapter,
          store, entityNames, tenant.cloudMeta, {
            localFlushIntervalMs: config.options?.localFlushIntervalMs,
            cloudSyncIntervalMs: config.options?.cloudSyncIntervalMs,
          },
        );
        syncScheduler.start();
      }

      log('tenant %s loaded and hydrated', tenantId);
    },
  };

  return {
    tenants,
    repo<T>(def: EntityDefinition<T>): Repository<T> | SingletonRepository<T> {
      assertNotDisposed();
      const r = repoMap.get(def.name);
      if (!r) throw new Error(`Unknown entity definition: ${def.name}`);
      return r as Repository<T> | SingletonRepository<T>;
    },
    async sync() {
      assertNotDisposed();
      const tenant = baseTenants.activeTenant$.getValue();
      if (!tenant) throw new Error('No tenant loaded');
      if (!config.cloudAdapter) throw new Error('No cloud adapter configured');

      syncEvents.emit({ type: 'sync-started' });
      try {
        await syncNow(
          syncLock, config.localAdapter, config.cloudAdapter,
          store, entityNames, tenant.cloudMeta,
        );
        dirtyTracker.clearDirty();
        const result: SyncResult = {
          entitiesUpdated: 0, conflictsResolved: 0, partitionsSynced: 0,
        };
        syncEvents.emit({ type: 'sync-completed', result });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        syncEvents.emit({ type: 'sync-failed', error });
        throw error;
      }
    },
    get isDirty() { return dirtyTracker.isDirty; },
    isDirty$: dirtyTracker.isDirty$,
    onSyncEvent(listener) { syncEvents.on(listener); },
    offSyncEvent(listener) { syncEvents.off(listener); },
    dispose() {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        syncScheduler?.stop();
        await syncLock.drain();
        await flushScheduler.flush();
        for (const r of repoMap.values()) r.dispose();
        eventBus.off(dirtyFlushListener);
        syncLock.dispose();
        log('strata disposed');
      })();
      return disposePromise;
    },
  };
}
