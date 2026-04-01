import debug from 'debug';
import type { Observable } from 'rxjs';
import { createHlc } from '@strata/hlc';
import type { Hlc } from '@strata/hlc';
import type { BlobAdapter } from '@strata/adapter';
import {
  EncryptionTransformService,
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
} from '@strata/sync';
import type {
  SyncResult, SyncEventListener,
  SyncEngineType,
} from '@strata/sync';
import { assertNotDisposed } from '@strata/utils';

const log = debug('strata:core');

// ─── Types ───────────────────────────────────────────────

export type { StrataOptions, ResolvedStrataOptions } from './options';
export { resolveOptions } from './options';
import { resolveOptions } from './options';
import type { StrataOptions, ResolvedStrataOptions } from './options';

export type StrataConfig = {
  readonly appId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly entities: ReadonlyArray<EntityDefinition<any>>;
  readonly localAdapter: BlobAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly deviceId: string;
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
  readonly migrations?: ReadonlyArray<BlobMigration>;
  readonly encryptionService?: EncryptionTransformService;
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
  private readonly syncEngine: SyncEngineType;
  private readonly dirtyTracker: DirtyTracker;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly repoMap = new Map<string, RepositoryType<unknown> | SingletonRepositoryType<unknown>>();
  private readonly config: StrataConfig;
  private readonly dirtyFlushListener: (event: { fromSync?: boolean }) => void;

  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(config: StrataConfig) {
    validateEntityDefinitions(config.entities);
    this.config = config;
    const resolvedOptions = resolveOptions(config.options);
    const encryptionService = config.encryptionService ?? new EncryptionTransformService(resolvedOptions);
    const store = new Store(resolvedOptions);

    this.hlcRef = { current: createHlc(config.deviceId) };
    this.eventBus = new EventBus();
    this.syncEngine = new SyncEngine(
      store, config.localAdapter, config.cloudAdapter,
      config.entities.map(d => d.name), this.hlcRef, this.eventBus,
      config.migrations, resolvedOptions,
    );
    this.dirtyTracker = new DirtyTracker();
    this.isDirty$ = this.dirtyTracker.isDirty$;

    for (const def of config.entities) {
      if (def.keyStrategy.kind === 'singleton') {
        this.repoMap.set(def.name, new SingletonRepository(def, store, this.hlcRef, this.eventBus));
      } else {
        this.repoMap.set(def.name, new Repository(def, store, this.hlcRef, this.eventBus));
      }
    }

    this.tenants = new TenantManager({
      adapter: config.localAdapter,
      cloudAdapter: config.cloudAdapter,
      syncEngine: this.syncEngine,
      store,
      dirtyTracker: this.dirtyTracker,
      encryptionService,
      options: resolvedOptions,
      appId: config.appId,
      entityTypes: config.entities.map(d => d.name),
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

  repo<T>(def: EntityDefinition<T, 'singleton'>): SingletonRepositoryType<T>;
  repo<T>(def: EntityDefinition<T, 'global' | 'partitioned'>): RepositoryType<T>;
  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T>;
  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T> {
    assertNotDisposed(this.disposed, 'Strata instance');
    const r = this.repoMap.get(def.name);
    if (!r) throw new Error(`Unknown entity definition: ${def.name}`);
    return r as RepositoryType<T> | SingletonRepositoryType<T>;
  }

  async sync(): Promise<SyncResult> {
    assertNotDisposed(this.disposed, 'Strata instance');
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

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = (async () => {
      await this.tenants.close();
      for (const r of this.repoMap.values()) r.dispose();
      this.eventBus.off(this.dirtyFlushListener);
      this.syncEngine.dispose();
      log('strata disposed');
    })();
    return this.disposePromise;
  }
}
