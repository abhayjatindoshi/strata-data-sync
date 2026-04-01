import type { Tenant } from '@strata/tenant';

export type { Tenant } from '@strata/tenant';

export type BlobAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};

export type EncryptionService = {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  setup(password: string, appId: string): Promise<void>;
  setDek(dek: CryptoKey): void;
  clear(): void;
  readonly isConfigured: boolean;
  encrypt(data: Uint8Array, key: string): Promise<Uint8Array>;
  decrypt(data: Uint8Array, key: string): Promise<Uint8Array>;
};
