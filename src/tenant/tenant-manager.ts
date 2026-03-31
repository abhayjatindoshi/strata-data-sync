import debug from 'debug';
import { BehaviorSubject } from 'rxjs';
import type { BlobAdapter } from '@strata/adapter';
import {
  EncryptionTransformService,
  createEncryptedMarkerDek,
} from '@strata/adapter/encryption';
import type {
  Tenant,
  CreateTenantOptions,
  SetupTenantOptions,
  TenantManagerOptions,
  TenantManager as TenantManagerType,
} from './types';
import { loadTenantList, saveTenantList } from './tenant-list';
import { writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from './marker-blob';
import { loadTenantPrefs } from './tenant-prefs';

const log = debug('strata:tenant');

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

function generateTenantId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

export class TenantManager {
  private readonly subject: BehaviorSubject<Tenant | undefined>;
  private cachedList: Tenant[] | null = null;

  readonly activeTenant$: BehaviorSubject<Tenant | undefined>;

  constructor(
    private readonly adapter: BlobAdapter,
    private readonly options: TenantManagerOptions,
    private readonly encryptionService?: EncryptionTransformService,
  ) {
    this.subject = new BehaviorSubject<Tenant | undefined>(undefined);
    this.activeTenant$ = this.subject;
  }

  private async getList(): Promise<Tenant[]> {
    if (!this.cachedList) {
      this.cachedList = await loadTenantList(this.adapter, this.options);
    }
    return this.cachedList;
  }

  private async persistList(tenants: Tenant[]): Promise<void> {
    this.cachedList = tenants;
    await saveTenantList(this.adapter, tenants, this.options);
  }

  async list(): Promise<ReadonlyArray<Tenant>> {
    return this.getList();
  }

  async create(opts: CreateTenantOptions): Promise<Tenant> {
    const tenants = await this.getList();

    let id: string;
    if (opts.id) {
      id = opts.id;
    } else if (this.options?.deriveTenantId) {
      id = this.options.deriveTenantId(opts.meta);
    } else {
      id = generateTenantId();
    }

    const now = new Date();
    const tenant: Tenant = {
      id,
      name: opts.name,
      meta: opts.meta,
      createdAt: now,
      updatedAt: now,
    };

    let dekBase64: string | undefined;
    if (opts.encryption && this.encryptionService) {
      const { dek, dekBase64: b64 } = await createEncryptedMarkerDek();
      dekBase64 = b64;
      await this.encryptionService.setup(
        opts.encryption.password, this.options?.appId ?? '',
      );
      this.encryptionService.setDek(dek);
    }

    await writeMarkerBlob(this.adapter, tenant, this.options?.entityTypes ?? [], this.options, dekBase64);

    if (opts.encryption && this.encryptionService) {
      this.encryptionService.clear();
    }

    await this.persistList([...tenants, tenant]);
    log('created tenant %s', id);

    return tenant;
  }

  async load(tenantId: string): Promise<void> {
    const tenants = await this.getList();
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    this.subject.next(tenant);
    log('loaded tenant %s', tenantId);
  }

  async setup(opts: SetupTenantOptions): Promise<Tenant> {
    let id: string;
    if (this.options?.deriveTenantId) {
      id = this.options.deriveTenantId(opts.meta);
    } else {
      id = generateTenantId();
    }

    const tenants = await this.getList();
    const existing = tenants.find(t => t.id === id);
    if (existing) return existing;

    const now = new Date();
    const tempTenant: Tenant = {
      id,
      name: opts.name ?? 'Shared Workspace',
      meta: opts.meta,
      createdAt: now,
      updatedAt: now,
    };

    const marker = await readMarkerBlob(this.adapter, tempTenant, this.options);
    if (!marker) {
      throw new Error('No strata workspace found at the specified location');
    }
    if (!validateMarkerBlob(marker)) {
      throw new Error('Incompatible strata workspace version');
    }

    const prefs = await loadTenantPrefs(this.adapter, tempTenant);

    const tenant: Tenant = {
      id,
      name: prefs?.name ?? opts.name ?? 'Shared Workspace',
      meta: opts.meta,
      createdAt: now,
      updatedAt: now,
    };

    await this.persistList([...tenants, tenant]);
    log('setup tenant %s', id);

    return tenant;
  }

  async delink(tenantId: string): Promise<void> {
    const tenants = await this.getList();
    const filtered = tenants.filter(t => t.id !== tenantId);
    await this.persistList(filtered);

    if (this.subject.getValue()?.id === tenantId) {
      this.subject.next(undefined);
    }
    log('delinked tenant %s', tenantId);
  }

  async delete(tenantId: string): Promise<void> {
    const tenants = await this.getList();
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const keys = await this.adapter.list(tenant, '');
    for (const key of keys) {
      await this.adapter.delete(tenant, key);
    }

    const filtered = tenants.filter(t => t.id !== tenantId);
    await this.persistList(filtered);

    if (this.subject.getValue()?.id === tenantId) {
      this.subject.next(undefined);
    }
    log('deleted tenant %s', tenantId);
  }
}
