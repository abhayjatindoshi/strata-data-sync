import debug from 'debug';
import type { Observable } from 'rxjs';
import { createHlc } from '@strata/hlc';
import type { Hlc } from '@strata/hlc';
import type { BlobAdapter } from '@strata/adapter';
import type { EntityDefinition } from '@strata/schema';
import { createEventBus } from '@strata/reactive';
import { createStore, createFlushScheduler } from '@strata/store';
import { createRepository, createSingletonRepository } from '@strata/repo';
import type { RepositoryType, SingletonRepositoryType } from '@strata/repo';
import { createTenantManager } from '@strata/tenant';
import type { TenantManagerType } from '@strata/tenant';
import {
  createSyncLock, createSyncEventEmitter, createDirtyTracker,
  createSyncScheduler, syncNow, hydrateFromCloud, hydrateFromLocal,
} from '@strata/sync';
import type {
  SyncResult, SyncEventListener, SyncSchedulerType,
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

// ─── Class ───────────────────────────────────────────────

export class Strata {
  readonly tenants: TenantManagerType;
  readonly isDirty$: Observable<boolean>;

  private readonly hlcRef: { current: Hlc };
  private readonly eventBus: ReturnType<typeof createEventBus>;
  private readonly store: ReturnType<typeof createStore>;
  private readonly flushScheduler: ReturnType<typeof createFlushScheduler>;
  private readonly syncLock: ReturnType<typeof createSyncLock>;
  private readonly syncEvents: ReturnType<typeof createSyncEventEmitter>;
  private readonly dirtyTracker: ReturnType<typeof createDirtyTracker>;
  private readonly entityNames: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly repoMap = new Map<string, RepositoryType<unknown> | SingletonRepositoryType<unknown>>();
  private readonly baseTenants: TenantManagerType;
  private readonly config: StrataConfig;
  private readonly dirtyFlushListener: () => void;

  private syncScheduler: SyncSchedulerType | null = null;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(config: StrataConfig) {
    validateEntityDefinitions(config.entities);
    this.config = config;

    this.hlcRef = { current: createHlc(config.deviceId) };
    this.eventBus = createEventBus();
    this.store = createStore();
    this.flushScheduler = createFlushScheduler(
      config.localAdapter, undefined, this.store,
      { debounceMs: config.options?.flushDebounceMs },
    );
    this.syncLock = createSyncLock();
    this.syncEvents = createSyncEventEmitter();
    this.dirtyTracker = createDirtyTracker();
    this.entityNames = config.entities.map(d => d.name);
    this.isDirty$ = this.dirtyTracker.isDirty$;

    for (const def of config.entities) {
      if (def.keyStrategy.kind === 'singleton') {
        this.repoMap.set(def.name, createSingletonRepository(def, this.store, this.hlcRef, this.eventBus));
      } else {
        this.repoMap.set(def.name, createRepository(def, this.store, this.hlcRef, this.eventBus));
      }
    }

    this.baseTenants = createTenantManager(config.localAdapter, {
      entityTypes: this.entityNames,
    });

    const dirtyFlushListener = () => {
      this.dirtyTracker.markDirty();
      this.flushScheduler.schedule();
    };
    this.dirtyFlushListener = dirtyFlushListener;
    this.eventBus.on(dirtyFlushListener);

    this.tenants = this.createTenantsWrapper();
  }

  private createTenantsWrapper(): TenantManagerType {
    const self = this;
    return {
      list: () => self.baseTenants.list(),
      create: (opts) => self.baseTenants.create(opts),
      setup: (opts) => self.baseTenants.setup(opts),
      delink: (id) => self.baseTenants.delink(id),
      delete: (id) => self.baseTenants.delete(id),
      activeTenant$: self.baseTenants.activeTenant$,
      async load(tenantId) {
        self.assertNotDisposed();
        await self.baseTenants.load(tenantId);
        const tenant = self.baseTenants.activeTenant$.getValue();
        if (!tenant) return;

        if (self.syncScheduler) {
          self.syncScheduler.stop();
          self.syncScheduler = null;
        }

        self.store.clear();
        self.flushScheduler.setMeta(tenant.meta);

        if (self.config.cloudAdapter) {
          try {
            await hydrateFromCloud(
              self.config.cloudAdapter, self.config.localAdapter,
              self.store, self.entityNames, tenant.meta,
            );
          } catch {
            self.syncEvents.emit({ type: 'cloud-unreachable' });
            await hydrateFromLocal(self.config.localAdapter, self.store, self.entityNames, tenant.meta);
          }
        } else {
          await hydrateFromLocal(self.config.localAdapter, self.store, self.entityNames, tenant.meta);
        }

        if (self.config.cloudAdapter) {
          self.syncScheduler = createSyncScheduler(
            self.syncLock, self.config.localAdapter, self.config.cloudAdapter,
            self.store, self.entityNames, tenant.meta, {
              localFlushIntervalMs: self.config.options?.localFlushIntervalMs,
              cloudSyncIntervalMs: self.config.options?.cloudSyncIntervalMs,
            },
          );
          self.syncScheduler.start();
        }

        log('tenant %s loaded and hydrated', tenantId);
      },
    };
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('Strata instance is disposed');
  }

  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T> {
    this.assertNotDisposed();
    const r = this.repoMap.get(def.name);
    if (!r) throw new Error(`Unknown entity definition: ${def.name}`);
    return r as RepositoryType<T> | SingletonRepositoryType<T>;
  }

  async sync(): Promise<SyncResult> {
    this.assertNotDisposed();
    const tenant = this.baseTenants.activeTenant$.getValue();
    if (!tenant) throw new Error('No tenant loaded');
    if (!this.config.cloudAdapter) throw new Error('No cloud adapter configured');

    this.syncEvents.emit({ type: 'sync-started' });
    try {
      await syncNow(
        this.syncLock, this.config.localAdapter, this.config.cloudAdapter,
        this.store, this.entityNames, tenant.meta,
      );
      this.dirtyTracker.clearDirty();
      const result: SyncResult = {
        entitiesUpdated: 0, conflictsResolved: 0, partitionsSynced: 0,
      };
      this.syncEvents.emit({ type: 'sync-completed', result });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.syncEvents.emit({ type: 'sync-failed', error });
      throw error;
    }
  }

  get isDirty(): boolean { return this.dirtyTracker.isDirty; }

  onSyncEvent(listener: SyncEventListener): void { this.syncEvents.on(listener); }

  offSyncEvent(listener: SyncEventListener): void { this.syncEvents.off(listener); }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = (async () => {
      this.syncScheduler?.stop();
      await this.syncLock.drain();
      await this.flushScheduler.flush();
      for (const r of this.repoMap.values()) r.dispose();
      this.eventBus.off(this.dirtyFlushListener);
      this.syncLock.dispose();
      log('strata disposed');
    })();
    return this.disposePromise;
  }
}

// ─── Factory ─────────────────────────────────────────────

export function createStrata(config: StrataConfig): Strata {
  return new Strata(config);
}
