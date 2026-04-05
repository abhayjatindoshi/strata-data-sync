import type { Tenant } from '@strata/tenant';

export type { Tenant } from '@strata/tenant';

export type StorageAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export type EncryptionStrategy<TKey = string> = {
  encrypt(data: Uint8Array, key: TKey): Promise<Uint8Array>;
  decrypt(data: Uint8Array, key: TKey): Promise<Uint8Array>;
};

export type EncryptionKeys = unknown;

export type EncryptionService = {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  encrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array>;
  decrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array>;
  deriveKeys(credential: string, appId: string): Promise<EncryptionKeys>;
  generateKeyData(keys: EncryptionKeys): Promise<{ keys: EncryptionKeys; keyData?: Record<string, unknown> }>;
  loadKeyData(keys: EncryptionKeys, data: Record<string, unknown>): Promise<EncryptionKeys>;
  rekey(keys: EncryptionKeys, credential: string, appId: string): Promise<{ keys: EncryptionKeys; keyData?: Record<string, unknown> }>;
};

export const noopEncryptionService: EncryptionService = {
  targets: [],
  encrypt: async (_blobKey, data) => data,
  decrypt: async (_blobKey, data) => data,
  deriveKeys: async () => null,
  generateKeyData: async (keys) => ({ keys }),
  loadKeyData: async (keys) => keys,
  rekey: async (keys) => ({ keys }),
};

