import debug from 'debug';
import type { EncryptionService, EncryptionKeys } from '@strata/adapter';
import type { EntityStore } from '@strata/store';
import type { DataAdapter } from '@strata/persistence';
import type { ResolvedStrataOptions } from '../options';
import type { SyncEngineType, SyncResult, SyncLocation, SyncEvent } from '@strata/sync';
import type { ReactiveFlag } from '@strata/utils';
import type { EventBus } from '@strata/reactive';
import { generateId } from '@strata/utils';
import { partitionBlobKey } from '@strata/adapter';
import type {
  Tenant,
  ProbeResult,
  CreateTenantOptions,
  JoinTenantOptions,
  TenantManager as TenantManagerType,
} from './types';
import type { TenantContext } from './tenant-context';
import { loadTenantList, saveTenantList } from './tenant-list';
import { writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from './marker-blob';
import { loadTenantPrefs } from './tenant-prefs';

const log = debug('strata:tenant');

export type TenantManagerDeps = {
  readonly adapter: DataAdapter;
  readonly cloudAdapter?: DataAdapter;
  readonly syncEngine: SyncEngineType;
  readonly syncEventBus: EventBus<SyncEvent>;
  readonly store: EntityStore;
  readonly dirtyTracker: ReactiveFlag;
  readonly encryptionService: EncryptionService;
  readonly tenantContext: TenantContext;
  readonly options: ResolvedStrataOptions;
  readonly appId: string;
  readonly entityTypes: readonly string[];
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
};

export class TenantManager implements TenantManagerType {
  private cachedList: Tenant[] | null = null;

  readonly activeTenant$;

  get activeTenant(): Tenant | undefined {
    return this.deps.tenantContext.activeTenant;
  }

  constructor(private readonly deps: TenantManagerDeps) {
    this.activeTenant$ = deps.tenantContext.activeTenant$;
  }

  // ─── Internals ───────────────────────────────────────────

  private async getList(): Promise<Tenant[]> {
    if (!this.cachedList) {
      this.cachedList = await loadTenantList(this.deps.adapter, this.deps.options);
    }
    return this.cachedList;
  }

  private async persistList(tenants: Tenant[]): Promise<void> {
    this.cachedList = tenants;
    await saveTenantList(this.deps.adapter, tenants, this.deps.options);
  }

  private deriveId(meta: Record<string, unknown>): string {
    if (this.deps.deriveTenantId) {
      return this.deps.deriveTenantId(meta);
    }
    return generateId();
  }

  // ─── Cold ops ────────────────────────────────────────────

  async list(): Promise<ReadonlyArray<Tenant>> {
    return this.getList();
  }

  async probe(ref: { meta: Record<string, unknown> }): Promise<ProbeResult> {
    const id = this.deriveId(ref.meta);
    const tempTenant: Tenant = {
      id,
      name: '',
      encrypted: false,
      meta: ref.meta,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const marker = await readMarkerBlob(this.deps.adapter, tempTenant, this.deps.options);
      if (!marker) return { exists: false };
      return { exists: true, encrypted: !!marker.keyData, tenantId: id };
    } catch {
      // Parse failure means encrypted data
      return { exists: true, encrypted: true, tenantId: id };
    }
  }

  async create(opts: CreateTenantOptions): Promise<Tenant> {
    const tenants = await this.getList();

    let id: string;
    if (opts.id) {
      id = opts.id;
    } else {
      id = this.deriveId(opts.meta);
    }

    const now = new Date();
    const encrypted = !!opts.encryption;
    const tenant: Tenant = {
      id,
      name: opts.name,
      encrypted,
      meta: opts.meta,
      createdAt: now,
      updatedAt: now,
    };

    let keyData: Record<string, unknown> | undefined;
    if (opts.encryption) {
      let keys = await this.deps.encryptionService.deriveKeys(
        opts.encryption.credential, this.deps.appId,
      );
      const result = await this.deps.encryptionService.generateKeyData(keys);
      keys = result.keys;
      keyData = result.keyData;
      // Temporarily set context so writeMarkerBlob can encrypt
      this.deps.tenantContext.set(tenant, keys);
    }

    await writeMarkerBlob(
      this.deps.adapter, tenant, this.deps.entityTypes, this.deps.options, keyData,
    );

    if (opts.encryption) {
      this.deps.tenantContext.clear();
    }

    await this.persistList([...tenants, tenant]);
    log('created tenant %s', id);

    return tenant;
  }

  async join(opts: JoinTenantOptions): Promise<Tenant> {
    const id = this.deriveId(opts.meta);

    const tenants = await this.getList();
    const existing = tenants.find(t => t.id === id);
    if (existing) return existing;

    const tempTenant: Tenant = {
      id,
      name: opts.name ?? 'Shared Workspace',
      encrypted: false,
      meta: opts.meta,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Probe to detect if workspace exists and whether it's encrypted
    let encrypted = false;
    try {
      const marker = await readMarkerBlob(this.deps.adapter, tempTenant, this.deps.options);
      if (!marker) {
        throw new Error('No strata workspace found at the specified location');
      }
      if (!validateMarkerBlob(marker)) {
        throw new Error('Incompatible strata workspace version');
      }
      encrypted = !!marker.keyData;
    } catch (err) {
      if (err instanceof Error && (
        err.message.includes('No strata workspace') ||
        err.message.includes('Incompatible strata')
      )) {
        throw err;
      }
      // Parse failure means encrypted
      encrypted = true;
    }

    const prefs = encrypted ? undefined : await loadTenantPrefs(this.deps.adapter, tempTenant);

    const now = new Date();
    const tenant: Tenant = {
      id,
      name: prefs?.name ?? opts.name ?? 'Shared Workspace',
      encrypted,
      meta: opts.meta,
      createdAt: now,
      updatedAt: now,
    };

    await this.persistList([...tenants, tenant]);
    log('joined tenant %s', id);

    return tenant;
  }

  async remove(tenantId: string, opts?: { purge?: boolean }): Promise<void> {
    const tenants = await this.getList();
    const tenant = tenants.find(t => t.id === tenantId);

    if (opts?.purge && tenant) {
      const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
      if (marker?.indexes) {
        for (const [entityName, partitions] of Object.entries(marker.indexes)) {
          for (const partitionKey of Object.keys(partitions)) {
            await this.deps.adapter.delete(tenant, partitionBlobKey(entityName, partitionKey));
          }
        }
      }
      await this.deps.adapter.delete(tenant, this.deps.options.markerKey);
    }

    const filtered = tenants.filter(t => t.id !== tenantId);
    await this.persistList(filtered);

    if (this.deps.tenantContext.activeTenant?.id === tenantId) {
      this.deps.tenantContext.clear();
    }
    log('%s tenant %s', opts?.purge ? 'deleted' : 'removed', tenantId);
  }

  // ─── Hot ops ─────────────────────────────────────────────

  async open(tenantId: string, opts?: { credential?: string }): Promise<void> {
    await this.close();

    const tenants = await this.getList();
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    let keys: EncryptionKeys | null = null;

    // Encryption setup
    if (tenant.encrypted) {
      if (!opts?.credential) {
        throw new Error('Credential required for encrypted tenant');
      }
      try {
        keys = await this.deps.encryptionService.deriveKeys(opts.credential, this.deps.appId);
        this.deps.tenantContext.set(tenant, keys);
        const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
        if (marker?.keyData) {
          keys = await this.deps.encryptionService.loadKeyData(keys, marker.keyData);
        }
      } catch (err) {
        this.deps.tenantContext.clear();
        throw err;
      }
    }

    this.deps.tenantContext.set(tenant, keys);

    // Hydrate: cloud → local → memory
    const hasCloud = !!this.deps.cloudAdapter;
    if (hasCloud) {
      try {
        await this.deps.syncEngine.run(tenant, [['cloud', 'local']]);
      } catch {
        this.deps.syncEventBus.emit({ type: 'sync-failed', source: 'local', target: 'cloud', error: new Error('Cloud unreachable') });
      }
    }
    await this.deps.syncEngine.run(tenant, [['local', 'memory']]);

    // Start scheduler
    this.deps.syncEngine.startScheduler(tenant, hasCloud, this.deps.dirtyTracker);

    log('tenant %s opened', tenant.id);
  }

  async close(): Promise<void> {
    this.deps.syncEngine.stopScheduler();

    const tenant = this.deps.tenantContext.activeTenant;
    if (tenant) {
      await this.deps.syncEngine.run(tenant, [['memory', 'local']]);
    }
    await this.deps.syncEngine.drain();

    this.deps.store.clear();
    this.deps.dirtyTracker.clear();
    this.deps.tenantContext.clear();

    log('tenant closed');
  }

  async sync(): Promise<SyncResult> {
    const tenant = this.deps.tenantContext.activeTenant;
    if (!tenant) throw new Error('No tenant loaded');
    if (!this.deps.cloudAdapter) throw new Error('No cloud adapter configured');

    const results = await this.deps.syncEngine.run(tenant, [
      ['memory', 'local'],
      ['local', 'cloud'],
      ['local', 'memory'],
    ]);
    this.deps.dirtyTracker.clear();
    const cloudResult = results[1];
    return {
      entitiesUpdated: cloudResult.changesForB.length,
      conflictsResolved: cloudResult.changesForA.length,
      partitionsSynced: cloudResult.changesForA.length + cloudResult.changesForB.length,
    };
  }

  async changeCredential(oldCredential: string, newCredential: string): Promise<void> {
    const tenant = this.deps.tenantContext.activeTenant;
    if (!tenant) throw new Error('No tenant loaded');
    if (!tenant.encrypted) throw new Error('Current tenant is not encrypted');

    try {
      // Verify old credential by deriving keys and reading marker
      let keys = await this.deps.encryptionService.deriveKeys(oldCredential, this.deps.appId);
      this.deps.tenantContext.set(tenant, keys);
      const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
      if (!marker) throw new Error('Failed to read marker blob');
      if (marker.keyData) {
        keys = await this.deps.encryptionService.loadKeyData(keys, marker.keyData);
        this.deps.tenantContext.set(tenant, keys);
      }

      // Old credential verified — rekey with new credential
      const result = await this.deps.encryptionService.rekey(
        keys, newCredential, this.deps.appId,
      );
      this.deps.tenantContext.set(tenant, result.keys);

      await writeMarkerBlob(
        this.deps.adapter, tenant, marker.entityTypes, this.deps.options, result.keyData,
      );

      log('encryption credential changed');
    } catch (err) {
      // Restore to old credential state
      const oldKeys = await this.deps.encryptionService.deriveKeys(oldCredential, this.deps.appId).catch(() => null);
      if (oldKeys) {
        this.deps.tenantContext.set(tenant, oldKeys);
        const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options).catch(() => null);
        if (marker?.keyData) {
          const fullKeys = await this.deps.encryptionService.loadKeyData(oldKeys, marker.keyData).catch(() => oldKeys);
          this.deps.tenantContext.set(tenant, fullKeys);
        }
      }
      throw err;
    }
  }
}
