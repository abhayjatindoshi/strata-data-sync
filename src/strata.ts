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
import { EventBus } from '@strata/reactive';
import { Store } from '@strata/store';
import { Repository, SingletonRepository } from '@strata/repo';
import type { RepositoryType, SingletonRepositoryType } from '@strata/repo';
import { TenantManager } from '@strata/tenant';
import type { TenantManagerType } from '@strata/tenant';
import {
  SyncEngine, DirtyTracker,
  SyncScheduler,
} from '@strata/sync';
import type {
  SyncResult, SyncEventListener, SyncSchedulerType,
  SyncEngineType,
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
  private readonly eventBus: EventBus;
  private readonly store: Store;
  private readonly syncEngine: SyncEngineType;
  private readonly dirtyTracker: DirtyTracker;
  private readonly entityNames: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly repoMap = new Map<string, RepositoryType<unknown> | SingletonRepositoryType<unknown>>();
  private readonly config: StrataConfig;
  private readonly localAdapter: BlobAdapter;
  private readonly storageAdapter: StorageAdapter | undefined;
  private readonly dirtyFlushListener: (event: { fromSync?: boolean }) => void;

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
    this.eventBus = new EventBus();
    this.store = new Store();
    this.syncEngine = new SyncEngine(
      this.store, this.localAdapter, config.cloudAdapter,
      config.entities.map(d => d.name), this.hlcRef, this.eventBus,
    );
    this.dirtyTracker = new DirtyTracker();
    this.entityNames = config.entities.map(d => d.name);
    this.isDirty$ = this.dirtyTracker.isDirty$;

    for (const def of config.entities) {
      if (def.keyStrategy.kind === 'singleton') {
        this.repoMap.set(def.name, new SingletonRepository(def, this.store, this.hlcRef, this.eventBus));
      } else {
        this.repoMap.set(def.name, new Repository(def, this.store, this.hlcRef, this.eventBus));
      }
    }

    this.tenants = new TenantManager(this.localAdapter, {
      entityTypes: this.entityNames,
      deriveTenantId: config.deriveTenantId,
    });

    const dirtyFlushListener = (event: { fromSync?: boolean }) => {
      if (!event.fromSync) {
        this.dirtyTracker.markDirty();
      }
    };
    this.dirtyFlushListener = dirtyFlushListener;
    this.eventBus.on(dirtyFlushListener);
  }

  private async unloadCurrentTenant(): Promise<void> {
    this.syncScheduler?.stop();
    this.syncScheduler = null;
    const tenant = this.tenants.activeTenant$.getValue();
    if (tenant) {
      await this.syncEngine.sync('memory', 'local', tenant);
    }
    await this.syncEngine.drain();
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
        await this.syncEngine.sync('cloud', 'local', tenant);
      } catch {
        this.syncEngine.emit({ type: 'cloud-unreachable' });
      }
      await this.syncEngine.sync('local', 'memory', tenant);
    } else {
      await this.syncEngine.sync('local', 'memory', tenant);
    }

    if (this.config.cloudAdapter) {
      this.syncScheduler = new SyncScheduler(
        this.syncEngine, tenant, true, {
          localFlushIntervalMs: this.config.options?.localFlushIntervalMs,
          cloudSyncIntervalMs: this.config.options?.cloudSyncIntervalMs,
          dirtyTracker: this.dirtyTracker,
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

    await this.syncEngine.sync('memory', 'local', tenant);
    const { result } = await this.syncEngine.sync('local', 'cloud', tenant);
    await this.syncEngine.sync('local', 'memory', tenant);
    this.dirtyTracker.clearDirty();
    return {
      entitiesUpdated: result.changesForB.length,
      conflictsResolved: result.changesForA.length,
      partitionsSynced: result.changesForA.length + result.changesForB.length,
    };
  }

  get isDirty(): boolean { return this.dirtyTracker.isDirty; }

  onSyncEvent(listener: SyncEventListener): void { this.syncEngine.on(listener); }

  offSyncEvent(listener: SyncEventListener): void { this.syncEngine.off(listener); }

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
      this.syncEngine.dispose();
      log('strata disposed');
    })();
    return this.disposePromise;
  }
}

// ─── Factory ─────────────────────────────────────────────

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
