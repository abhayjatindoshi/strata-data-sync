import type { PartitionBlob } from '@strata/persistence';
import type { Tenant } from '@strata/tenant';

export type { Tenant } from '@strata/tenant';

export type BlobAdapter = {
  readonly kind: 'blob';
  read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null>;
  write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};

export type BlobTransform = {
  encode(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array>;
  decode(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array>;
};

export type StorageAdapter = {
  readonly kind: 'storage';
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};
