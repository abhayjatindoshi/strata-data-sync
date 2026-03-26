import type { PartitionBlob } from '@strata/persistence';
import type { Tenant } from '@strata/tenant';

export type { Tenant } from '@strata/tenant';

export type BlobAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null>;
  write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};

export type BlobTransform = {
  encode(data: Uint8Array): Promise<Uint8Array>;
  decode(data: Uint8Array): Promise<Uint8Array>;
};
