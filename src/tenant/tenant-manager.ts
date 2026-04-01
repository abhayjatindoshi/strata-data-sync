import debug from 'debug';
import { BehaviorSubject } from 'rxjs';
import type { BlobAdapter } from '@strata/adapter';
import {
  EncryptionTransformService,
  createEncryptedMarkerDek,
  importDek,
} from '@strata/adapter/encryption';
import type { EntityStore } from '@strata/store';
import type { ResolvedStrataOptions } from '../options';
import type { SyncEngineType, SyncScheduler as SyncSchedulerType } from '@strata/sync';
import type { ReactiveFlag } from '@strata/utils';
import { SyncScheduler } from '@strata/sync';
import { generateId } from '@strata/utils';
import type {
  Tenant,
  ProbeResult,
  CreateTenantOptions,
  JoinTenantOptions,
  TenantManager as TenantManagerType,
} from './types';
import { loadTenantList, saveTenantList } from './tenant-list';
import { writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from './marker-blob';
import { loadTenantPrefs } from './tenant-prefs';

const log = debug('strata:tenant');

export type TenantManagerDeps = {
  readonly adapter: BlobAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly syncEngine: SyncEngineType;
  readonly store: EntityStore;
  readonly dirtyTracker: ReactiveFlag;
  readonly encryptionService: EncryptionTransformService;
  readonly options: ResolvedStrataOptions;
  readonly appId: string;
  readonly entityTypes: readonly string[];
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
};

export class TenantManager implements TenantManagerType {
  private readonly subject: BehaviorSubject<Tenant | undefined>;
  private cachedList: Tenant[] | null = null;
  private syncScheduler: SyncSchedulerType | null = null;

  readonly activeTenant$: BehaviorSubject<Tenant | undefined>;

  constructor(private readonly deps: TenantManagerDeps) {
    this.subject = new BehaviorSubject<Tenant | undefined>(undefined);
    this.activeTenant$ = this.subject;
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
      return { exists: true, encrypted: !!marker.dek, tenantId: id };
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

    let dekBase64: string | undefined;
    if (opts.encryption) {
      const { dek, dekBase64: b64 } = await createEncryptedMarkerDek();
      dekBase64 = b64;
      await this.deps.encryptionService.setup(
        opts.encryption.password, this.deps.appId,
      );
      this.deps.encryptionService.setDek(dek);
    }

    await writeMarkerBlob(
      this.deps.adapter, tenant, this.deps.entityTypes, this.deps.options, dekBase64,
    );

    if (opts.encryption) {
      this.deps.encryptionService.clear();
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
      encrypted = !!marker.dek;
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
      const keys = await this.deps.adapter.list(tenant, '');
      for (const key of keys) {
        await this.deps.adapter.delete(tenant, key);
      }
    }

    const filtered = tenants.filter(t => t.id !== tenantId);
    await this.persistList(filtered);

    if (this.subject.getValue()?.id === tenantId) {
      this.subject.next(undefined);
    }
    log('%s tenant %s', opts?.purge ? 'deleted' : 'removed', tenantId);
  }

  // ─── Hot ops ─────────────────────────────────────────────

  async open(tenantId: string, opts?: { password?: string }): Promise<void> {
    await this.close();

    const tenants = await this.getList();
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    this.subject.next(tenant);

    // Encryption setup
    if (tenant.encrypted) {
      if (!opts?.password) {
        this.subject.next(undefined);
        throw new Error('Password required for encrypted tenant');
      }
      try {
        await this.deps.encryptionService.setup(opts.password, this.deps.appId);
        const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
        if (!marker?.dek) {
          this.deps.encryptionService.clear();
          this.subject.next(undefined);
          throw new Error('Encrypted marker missing DEK');
        }
        const dek = await importDek(marker.dek);
        this.deps.encryptionService.setDek(dek);
      } catch (err) {
        this.deps.encryptionService.clear();
        this.subject.next(undefined);
        throw err;
      }
    }

    // Sync: cloud → local → memory
    if (this.deps.cloudAdapter) {
      try {
        await this.deps.syncEngine.sync('cloud', 'local', tenant);
      } catch {
        this.deps.syncEngine.emit({ type: 'cloud-unreachable' });
      }
      await this.deps.syncEngine.sync('local', 'memory', tenant);
    } else {
      await this.deps.syncEngine.sync('local', 'memory', tenant);
    }

    // Start scheduler
    this.syncScheduler = new SyncScheduler(
      this.deps.syncEngine, tenant, !!this.deps.cloudAdapter, {
        ...this.deps.options,
        dirtyTracker: this.deps.dirtyTracker,
      },
    );
    this.syncScheduler.start();

    log('tenant %s opened', tenant.id);
  }

  async close(): Promise<void> {
    this.syncScheduler?.stop();
    this.syncScheduler = null;

    const tenant = this.subject.getValue();
    if (tenant) {
      await this.deps.syncEngine.sync('memory', 'local', tenant);
    }
    await this.deps.syncEngine.drain();

    this.deps.store.clear();
    this.deps.dirtyTracker.clear();
    this.deps.encryptionService.clear();
    this.subject.next(undefined);

    log('tenant closed');
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const tenant = this.subject.getValue();
    if (!tenant) throw new Error('No tenant loaded');
    if (!tenant.encrypted) throw new Error('Current tenant is not encrypted');

    // Validate old password: re-derive marker key and try to read through encryption.
    // If oldPassword is wrong, AES-GCM decryption will throw InvalidEncryptionKeyError.
    try {
      await this.deps.encryptionService.setup(oldPassword, this.deps.appId);
      const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
      if (!marker) throw new Error('Failed to read marker blob');

      // Old password verified — now switch to new password
      await this.deps.encryptionService.setup(newPassword, this.deps.appId);
      this.deps.encryptionService.setDek(await importDek(marker.dek!));

      await writeMarkerBlob(
        this.deps.adapter, tenant, marker.entityTypes, this.deps.options, marker.dek,
      );

      log('encryption password changed');
    } catch (err) {
      // Restore encryption service to current state (re-setup with old password)
      await this.deps.encryptionService.setup(oldPassword, this.deps.appId);
      const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options).catch(() => null);
      if (marker?.dek) {
        this.deps.encryptionService.setDek(await importDek(marker.dek));
      }
      throw err;
    }
  }
}
