import debug from 'debug';
import type { BlobAdapter, EncryptionService } from './types';
import {
  deriveKey, generateDek, exportDek, importDek,
  encrypt as encryptData, decrypt as decryptData,
  InvalidEncryptionKeyError,
} from './crypto';

const log = debug('strata:encryption');

export type EncryptionServiceOptions = {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  readonly tenantKey?: string;
  readonly markerKey?: string;
};

export class EncryptionTransformService implements EncryptionService {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  private markerCryptoKey: CryptoKey | null = null;
  private dek: CryptoKey | null = null;
  private readonly tenantKey: string;
  private readonly markerKey: string;

  constructor(options: EncryptionServiceOptions) {
    this.targets = options.targets;
    this.tenantKey = options.tenantKey ?? '__tenants';
    this.markerKey = options.markerKey ?? '__strata';
  }

  async setup(
    password: string,
    appId: string,
  ): Promise<void> {
    this.markerCryptoKey = await deriveKey(password, appId);
    this.dek = null;
    log('marker key derived for app %s', appId);
  }

  setDek(dek: CryptoKey): void {
    this.dek = dek;
  }

  clear(): void {
    this.markerCryptoKey = null;
    this.dek = null;
  }

  get isConfigured(): boolean {
    return this.markerCryptoKey !== null;
  }

  async encrypt(data: Uint8Array, key: string): Promise<Uint8Array> {
    if (key === this.tenantKey) return data;
    if (key === this.markerKey) {
      if (!this.markerCryptoKey) return data;
      return encryptData(data, this.markerCryptoKey);
    }
    if (!this.dek) return data;
    return encryptData(data, this.dek);
  }

  async decrypt(data: Uint8Array, key: string): Promise<Uint8Array> {
    if (key === this.tenantKey) return data;
    if (key === this.markerKey) {
      if (!this.markerCryptoKey) return data;
      try {
        return await decryptData(data, this.markerCryptoKey);
      } catch {
        throw new InvalidEncryptionKeyError();
      }
    }
    if (!this.dek) return data;
    return decryptData(data, this.dek);
  }
}

export function withEncryption(adapter: BlobAdapter, service: EncryptionService): BlobAdapter {
  return {
    async read(tenant, key) {
      const raw = await adapter.read(tenant, key);
      if (!raw) return null;
      return service.decrypt(raw, key);
    },
    async write(tenant, key, data) {
      const encrypted = await service.encrypt(data, key);
      await adapter.write(tenant, key, encrypted);
    },
    delete: (t, k) => adapter.delete(t, k),
    list: (t, p) => adapter.list(t, p),
  };
}

export async function createEncryptedMarkerDek(): Promise<{ dek: CryptoKey; dekBase64: string }> {
  const dek = await generateDek();
  const dekBase64 = await exportDek(dek);
  return { dek, dekBase64 };
}

export { importDek, exportDek };
