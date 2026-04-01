import type { Tenant } from '@strata/tenant';

export type { Tenant } from '@strata/tenant';

export type BlobAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export type EncryptionStrategy<TKey = string> = {
  encrypt(data: Uint8Array, key: TKey): Promise<Uint8Array>;
  decrypt(data: Uint8Array, key: TKey): Promise<Uint8Array>;
};

export type EncryptionService = {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  activate(credential: string, appId: string): Promise<void>;
  generateKeyData(): Promise<Record<string, unknown> | undefined>;
  loadKeyData(data: Record<string, unknown>): Promise<void>;
  rekey(credential: string, appId: string): Promise<Record<string, unknown> | undefined>;
  deactivate(): void;
  readonly isActive: boolean;
  encrypt(blobKey: string, data: Uint8Array): Promise<Uint8Array>;
  decrypt(blobKey: string, data: Uint8Array): Promise<Uint8Array>;
};

export const noopEncryptionService: EncryptionService = {
  targets: [],
  activate: async () => {},
  generateKeyData: async () => undefined,
  loadKeyData: async () => {},
  rekey: async () => undefined,
  deactivate: () => {},
  get isActive() { return false; },
  encrypt: async (_blobKey, data) => data,
  decrypt: async (_blobKey, data) => data,
};
