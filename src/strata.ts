import debug from 'debug';
import type { Observable } from 'rxjs';
import { createHlc } from '@strata/hlc';
import type { Hlc } from '@strata/hlc';
import type { BlobAdapter, StorageAdapter } from '@strata/adapter';
import { AdapterBridge } from '@strata/adapter';
import {
  changeEncryptionPassword,
  initEncryption, encryptionTransform,
  enableEncryption as enableEnc, disableEncryption as disableEnc,
} from '@strata/adapter/encryption';
import type { EntityDefinition } from '@strata/schema';
import type { BlobMigration } from '@strata/schema/migration';
import { createEventBus } from '@strata/reactive';
import { createStore } from '@strata/store';
import { createRepository, createSingletonRepository } from '@strata/repo';
import type { RepositoryType, SingletonRepositoryType } from '@strata/repo';
import { createTenantManager } from '@strata/tenant';
import type { TenantManagerType } from '@strata/tenant';
import {
  createSyncLock, createSyncEventEmitter, createDirtyTracker,
  createSyncScheduler, syncNow,
  syncBetween,
} from '@strata/sync';
import type {
  SyncResult, SyncEventListener, SyncSchedulerType,
} from '@strata/sync';

const log = debug('strata:core');

// ─── Types ───────────────────────────────────────────────

export type StrataOptions = {
  readonly cloudSyncIntervalMs?: number;
  readonly localFlushIntervalMs?: number;
  readonly tombstoneRetentionMs?: number;
};

export type StrataConfig = {
  readonly appId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly entities: ReadonlyArray<EntityDefinition<any>>;
  readonly localAdapter: BlobAdapter | StorageAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly deviceId: string;
  readonly encryption?: { readonly password: string };
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
  readonly migrations?: ReadonlyArray<BlobMigration>;
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
  private readonly syncLock: ReturnType<typeof createSyncLock>;
  private readonly syncEvents: ReturnType<typeof createSyncEventEmitter>;
  private readonly dirtyTracker: ReturnType<typeof createDirtyTracker>;
  private readonly entityNames: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly repoMap = new Map<string, RepositoryType<unknown> | SingletonRepositoryType<unknown>>();
  private readonly config: StrataConfig;
  private readonly localAdapter: BlobAdapter;
  private readonly storageAdapter: StorageAdapter | undefined;
  private readonly dirtyFlushListener: () => void;

  private syncScheduler: SyncSchedulerType | null = null;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(config: StrataConfig) {
    validateEntityDefinitions(config.entities);
    this.config = config;

    if (config.localAdapter.kind === 'storage') {
      this.storageAdapter = config.localAdapter;
      this.localAdapter = new AdapterBridge(config.localAdapter, config.appId);
    } else {
      this.storageAdapter = undefined;
      this.localAdapter = config.localAdapter;
    }

    this.hlcRef = { current: createHlc(config.deviceId) };
    this.eventBus = createEventBus();
    this.store = createStore();
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

    this.tenants = createTenantManager(this.localAdapter, {
      entityTypes: this.entityNames,
      deriveTenantId: config.deriveTenantId,
    });

    const dirtyFlushListener = () => {
      this.dirtyTracker.markDirty();
    };
    this.dirtyFlushListener = dirtyFlushListener;
    this.eventBus.on(dirtyFlushListener);
  }

  private async unloadCurrentTenant(): Promise<void> {
    this.syncScheduler?.stop();
    this.syncScheduler = null;
    await this.syncLock.drain();
    const tenant = this.tenants.activeTenant$.getValue();
    if (tenant) {
      await syncBetween(this.store, this.localAdapter, this.store, this.entityNames, tenant);
    }
    this.store.clear();
    this.dirtyTracker.clearDirty();
  }

  async loadTenant(tenantId?: string): Promise<void> {
    this.assertNotDisposed();
    await this.unloadCurrentTenant();

    if (!tenantId) return;

    await this.tenants.load(tenantId);
    const tenant = this.tenants.activeTenant$.getValue()!;

    if (this.config.cloudAdapter) {
      try {
        await syncBetween(
          this.config.cloudAdapter, this.localAdapter,
          this.store, this.entityNames, tenant,
        );
      } catch {
        this.syncEvents.emit({ type: 'cloud-unreachable' });
        await syncBetween(this.localAdapter, this.store, this.store, this.entityNames, tenant);
      }
    } else {
      await syncBetween(this.localAdapter, this.store, this.store, this.entityNames, tenant);
    }

    if (this.config.cloudAdapter) {
      this.syncScheduler = createSyncScheduler(
        this.syncLock, this.localAdapter, this.config.cloudAdapter,
        this.store, this.entityNames, tenant, {
          localFlushIntervalMs: this.config.options?.localFlushIntervalMs,
          cloudSyncIntervalMs: this.config.options?.cloudSyncIntervalMs,
          dirtyTracker: this.dirtyTracker,
          syncEvents: this.syncEvents,
        },
      );
      this.syncScheduler.start();
    }

    log('tenant %s loaded and hydrated', tenant.id);
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('Strata instance is disposed');
  }

  repo<T>(def: EntityDefinition<T, 'singleton'>): SingletonRepositoryType<T>;
  repo<T>(def: EntityDefinition<T, 'global' | 'partitioned'>): RepositoryType<T>;
  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T>;
  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T> {
    this.assertNotDisposed();
    const r = this.repoMap.get(def.name);
    if (!r) throw new Error(`Unknown entity definition: ${def.name}`);
    return r as RepositoryType<T> | SingletonRepositoryType<T>;
  }

  async sync(): Promise<SyncResult> {
    this.assertNotDisposed();
    const tenant = this.tenants.activeTenant$.getValue();
    if (!tenant) throw new Error('No tenant loaded');
    if (!this.config.cloudAdapter) throw new Error('No cloud adapter configured');

    this.syncEvents.emit({ type: 'sync-started' });
    try {
      const result = await syncNow(
        this.syncLock, this.localAdapter, this.config.cloudAdapter,
        this.store, this.entityNames, tenant,
      );
      this.dirtyTracker.clearDirty();
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

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    this.assertNotDisposed();
    if (!this.storageAdapter) throw new Error('localAdapter must be a StorageAdapter for encryption');
    await changeEncryptionPassword(this.storageAdapter, this.config.appId, oldPassword, newPassword);
    log('encryption password changed');
  }

  async enableEncryption(password: string): Promise<void> {
    this.assertNotDisposed();
    if (!this.storageAdapter) throw new Error('localAdapter must be a StorageAdapter for encryption');
    await enableEnc(this.storageAdapter, this.config.appId, password);
    log('encryption enabled');
  }

  async disableEncryption(password: string): Promise<void> {
    this.assertNotDisposed();
    if (!this.storageAdapter) throw new Error('localAdapter must be a StorageAdapter for encryption');
    await disableEnc(this.storageAdapter, this.config.appId, password);
    log('encryption disabled');
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = (async () => {
      await this.unloadCurrentTenant();
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

export async function createStrataAsync(config: StrataConfig): Promise<Strata> {
  if (config.localAdapter.kind === 'storage' && config.encryption) {
    const storage = config.localAdapter;
    const encCtx = await initEncryption(
      storage, config.appId, config.encryption.password,
    );
    const localAdapter = new AdapterBridge(storage, config.appId, {
      transforms: [encryptionTransform(encCtx)],
    });
    return new Strata({ ...config, localAdapter });
  }
  return new Strata(config);
}
