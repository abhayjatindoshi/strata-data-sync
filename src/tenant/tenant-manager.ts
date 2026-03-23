import debug from 'debug';
import type { BlobAdapter } from '@strata/adapter';
import type {
  Tenant,
  CreateTenantOptions,
  SetupTenantOptions,
  TenantManagerOptions,
  TenantManager,
  Subscribable,
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

function createBehaviorSubject<T>(
  initial: T,
): Subscribable<T> & { next(value: T): void } {
  let current = initial;
  const callbacks: Array<(value: T) => void> = [];

  return {
    getValue() {
      return current;
    },
    next(value: T) {
      current = value;
      for (const cb of [...callbacks]) {
        cb(value);
      }
    },
    subscribe(callback: (value: T) => void) {
      callbacks.push(callback);
      return {
        unsubscribe() {
          const idx = callbacks.indexOf(callback);
          if (idx !== -1) callbacks.splice(idx, 1);
        },
      };
    },
  };
}

export function createTenantManager(
  adapter: BlobAdapter,
  options?: TenantManagerOptions,
): TenantManager {
  const subject = createBehaviorSubject<Tenant | undefined>(undefined);
  let cachedList: Tenant[] | null = null;

  async function getList(): Promise<Tenant[]> {
    if (!cachedList) {
      cachedList = await loadTenantList(adapter);
    }
    return cachedList;
  }

  async function persistList(tenants: Tenant[]): Promise<void> {
    cachedList = tenants;
    await saveTenantList(adapter, tenants);
  }

  return {
    activeTenant$: subject,

    async list() {
      return getList();
    },

    async create(opts: CreateTenantOptions) {
      const tenants = await getList();

      let id: string;
      if (opts.id) {
        id = opts.id;
      } else if (options?.deriveTenantId) {
        id = options.deriveTenantId(opts.cloudMeta);
      } else {
        id = generateTenantId();
      }

      const now = new Date();
      const tenant: Tenant = {
        id,
        name: opts.name,
        cloudMeta: opts.cloudMeta,
        createdAt: now,
        updatedAt: now,
      };

      await writeMarkerBlob(adapter, opts.cloudMeta, options?.entityTypes ?? []);

      await persistList([...tenants, tenant]);
      log('created tenant %s', id);

      return tenant;
    },

    async load(tenantId: string) {
      const tenants = await getList();
      const tenant = tenants.find(t => t.id === tenantId);
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      subject.next(tenant);
      log('loaded tenant %s', tenantId);
    },

    async setup(opts: SetupTenantOptions) {
      const marker = await readMarkerBlob(adapter, opts.cloudMeta);
      if (!marker) {
        throw new Error('No strata workspace found at the specified location');
      }
      if (!validateMarkerBlob(marker)) {
        throw new Error('Incompatible strata workspace version');
      }

      let id: string;
      if (options?.deriveTenantId) {
        id = options.deriveTenantId(opts.cloudMeta);
      } else {
        id = generateTenantId();
      }

      const tenants = await getList();
      const existing = tenants.find(t => t.id === id);
      if (existing) return existing;

      const prefs = await loadTenantPrefs(adapter, opts.cloudMeta);

      const now = new Date();
      const tenant: Tenant = {
        id,
        name: prefs?.name ?? opts.name ?? 'Shared Workspace',
        icon: prefs?.icon,
        color: prefs?.color,
        cloudMeta: opts.cloudMeta,
        createdAt: now,
        updatedAt: now,
      };

      await persistList([...tenants, tenant]);
      log('setup tenant %s', id);

      return tenant;
    },

    async delink(tenantId: string) {
      const tenants = await getList();
      const filtered = tenants.filter(t => t.id !== tenantId);
      await persistList(filtered);

      if (subject.getValue()?.id === tenantId) {
        subject.next(undefined);
      }
      log('delinked tenant %s', tenantId);
    },

    async delete(tenantId: string) {
      const tenants = await getList();
      const tenant = tenants.find(t => t.id === tenantId);
      if (!tenant) return;

      const keys = await adapter.list(tenant.cloudMeta, '');
      for (const key of keys) {
        await adapter.delete(tenant.cloudMeta, key);
      }

      const filtered = tenants.filter(t => t.id !== tenantId);
      await persistList(filtered);

      if (subject.getValue()?.id === tenantId) {
        subject.next(undefined);
      }
      log('deleted tenant %s', tenantId);
    },
  };
}
