import debug from 'debug';
import type { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { createHlc } from '@strata/hlc';
import type { Hlc } from '@strata/hlc';
import type { StorageAdapter, EncryptionService } from '@strata/adapter';
import {
  noopEncryptionService,
} from '@strata/adapter';
import type { Tenant } from '@strata/adapter';
import type { EntityDefinition } from '@strata/schema';
import type { BlobMigration } from '@strata/schema/migration';
import { EventBus } from '@strata/reactive';
import type { EntityEvent } from '@strata/reactive';
import { EncryptedDataAdapter } from '@strata/persistence';
import { Store } from '@strata/store';
import { Repository, SingletonRepository } from '@strata/repo';
import type { RepositoryType, SingletonRepositoryType } from '@strata/repo';
import { TenantManager, TenantContext } from '@strata/tenant';
import type { TenantManagerType } from '@strata/tenant';
import {
  SyncEngine,
} from '@strata/sync';
import type {
  SyncEvent,
  SyncEngineType,
} from '@strata/sync';
import { assertNotDisposed, ReactiveFlag } from '@strata/utils';

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
  readonly localAdapter: StorageAdapter;
  readonly cloudAdapter?: StorageAdapter;
  readonly deviceId: string;
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
  readonly migrations?: ReadonlyArray<BlobMigration>;
  readonly encryptionService?: EncryptionService;
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

  private readonly hlcRef: { current: Hlc };
  private readonly eventBus: EventBus<EntityEvent>;
  private readonly syncEventBus: EventBus<SyncEvent>;
  private readonly syncEngine: SyncEngineType;
  private readonly dirtyTracker: ReactiveFlag;
  private readonly tenantContext: TenantContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly repoMap = new Map<string, RepositoryType<unknown> | SingletonRepositoryType<unknown>>();
  private readonly config: StrataConfig;
  private readonly dirtySubscription: Subscription;

  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(config: StrataConfig) {
    validateEntityDefinitions(config.entities);
    this.config = config;
    const resolvedOptions = resolveOptions(config.options);
    const encryptionService = config.encryptionService ?? noopEncryptionService;

    const store = new Store(resolvedOptions);
    this.tenantContext = new TenantContext();

    // Create encrypted DataAdapters — read keys from tenantContext
    const localAdapter = new EncryptedDataAdapter(config.localAdapter, encryptionService, this.tenantContext);
    const cloudAdapter = config.cloudAdapter
      ? new EncryptedDataAdapter(config.cloudAdapter, encryptionService, this.tenantContext)
      : undefined;

    this.hlcRef = { current: createHlc(config.deviceId) };
    this.eventBus = new EventBus<EntityEvent>();
    this.syncEventBus = new EventBus<SyncEvent>();
    this.syncEngine = new SyncEngine(
      store, localAdapter, cloudAdapter,
      config.entities.map(d => d.name), this.hlcRef, this.eventBus, this.syncEventBus,
      config.migrations, resolvedOptions,
    );
    this.dirtyTracker = new ReactiveFlag();

    for (const def of config.entities) {
      if (def.keyStrategy.kind === 'singleton') {
        this.repoMap.set(def.name, new SingletonRepository(def, store, this.hlcRef, this.eventBus));
      } else {
        this.repoMap.set(def.name, new Repository(def, store, this.hlcRef, this.eventBus));
      }
    }

    this.tenants = new TenantManager({
      adapter: localAdapter,
      cloudAdapter,
      syncEngine: this.syncEngine,
      syncEventBus: this.syncEventBus,
      store,
      dirtyTracker: this.dirtyTracker,
      encryptionService,
      tenantContext: this.tenantContext,
      options: resolvedOptions,
      appId: config.appId,
      entityTypes: config.entities.map(d => d.name),
      deriveTenantId: config.deriveTenantId,
    });

    this.dirtySubscription = this.eventBus.all$.pipe(
      filter(e => e.source !== 'sync'),
    ).subscribe(() => this.dirtyTracker.set());
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

  get isDirty(): boolean { return this.dirtyTracker.value; }

  observe(channel: 'entity'): Observable<EntityEvent>;
  observe(channel: 'entity', entityName: string): Observable<EntityEvent>;
  observe(channel: 'sync'): Observable<SyncEvent>;
  observe(channel: 'dirty'): Observable<boolean>;
  observe(channel: 'tenant'): Observable<Tenant | undefined>;
  observe(channel: 'entity' | 'sync' | 'dirty' | 'tenant', entityName?: string): Observable<unknown> {
    assertNotDisposed(this.disposed, 'Strata instance');
    switch (channel) {
      case 'entity':
        return entityName
          ? this.eventBus.all$.pipe(filter((e: EntityEvent) => e.entityName === entityName))
          : this.eventBus.all$;
      case 'sync':
        return this.syncEventBus.all$;
      case 'dirty':
        return this.dirtyTracker.value$;
      case 'tenant':
        return this.tenantContext.activeTenant$;
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = (async () => {
      await this.tenants.close();
      for (const r of this.repoMap.values()) r.dispose();
      this.dirtySubscription.unsubscribe();
      this.eventBus.dispose();
      this.syncEventBus.dispose();
      this.syncEngine.dispose();
      log('strata disposed');
    })();
    return this.disposePromise;
  }
}

