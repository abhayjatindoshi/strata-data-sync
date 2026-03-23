import type { BlobAdapter, CloudMeta } from '@strata/adapter';
import { serialize, deserialize } from '@strata/persistence';
import type { Tenant } from './types.js';

const TENANTS_BLOB = '__tenants';
const STRATA_MARKER = '__strata';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type TenantRecord = {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
  readonly cloudMeta: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

function toRecord(tenant: Tenant): TenantRecord {
  return {
    id: tenant.id,
    name: tenant.name,
    ...(tenant.icon !== undefined ? { icon: tenant.icon } : {}),
    ...(tenant.color !== undefined ? { color: tenant.color } : {}),
    cloudMeta: tenant.cloudMeta,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function fromRecord(record: TenantRecord): Tenant {
  return {
    id: record.id,
    name: record.name,
    ...(record.icon !== undefined ? { icon: record.icon } : {}),
    ...(record.color !== undefined ? { color: record.color } : {}),
    cloudMeta: record.cloudMeta,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

export async function readTenantList(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
): Promise<Tenant[]> {
  const raw = await adapter.read(cloudMeta, TENANTS_BLOB);
  if (!raw) return [];
  const records = deserialize(decoder.decode(raw)) as TenantRecord[];
  return records.map(fromRecord);
}

export async function writeTenantList(
  adapter: BlobAdapter,
  cloudMeta: CloudMeta,
  tenants: ReadonlyArray<Tenant>,
): Promise<void> {
  const records = tenants.map(toRecord);
  const data = encoder.encode(serialize(records));
  await adapter.write(cloudMeta, TENANTS_BLOB, data);
}

export function unionMergeTenantLists(
  local: ReadonlyArray<Tenant>,
  cloud: ReadonlyArray<Tenant>,
): Tenant[] {
  const map = new Map<string, Tenant>();
  for (const t of local) map.set(t.id, t);
  for (const t of cloud) {
    const existing = map.get(t.id);
    if (!existing || t.updatedAt > existing.updatedAt) {
      map.set(t.id, t);
    }
  }
  return [...map.values()];
}

export async function writeMarkerBlob(
  adapter: BlobAdapter,
  cloudMeta: Readonly<Record<string, unknown>>,
): Promise<void> {
  const marker = { version: 1, createdAt: new Date().toISOString() };
  await adapter.write(cloudMeta, STRATA_MARKER, encoder.encode(serialize(marker)));
}

export async function readMarkerBlob(
  adapter: BlobAdapter,
  cloudMeta: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  const raw = await adapter.read(cloudMeta, STRATA_MARKER);
  return raw !== null;
}
