import debug from 'debug';
import type { BlobTransform, Tenant } from './types';
import {
  deriveKey, generateDek, exportDek, importDek,
  encrypt as encryptData, decrypt as decryptData,
  InvalidEncryptionKeyError,
} from './crypto';

const log = debug('strata:encryption');

export class EncryptionTransformService {
  private markerCryptoKey: CryptoKey | null = null;
  private dek: CryptoKey | null = null;
  private readonly tenantKey: string;
  private readonly markerKey: string;

  constructor(options: { readonly tenantKey: string; readonly markerKey: string }) {
    this.tenantKey = options.tenantKey;
    this.markerKey = options.markerKey;
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

  toTransform(): BlobTransform {
    return {
      encode: async (_tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array> => {
        if (key === this.tenantKey) return data;
        if (key === this.markerKey) {
          if (!this.markerCryptoKey) return data;
          return encryptData(data, this.markerCryptoKey);
        }
        if (!this.dek) return data;
        return encryptData(data, this.dek);
      },
      decode: async (_tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array> => {
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
      },
    };
  }
}

export async function createEncryptedMarkerDek(): Promise<{ dek: CryptoKey; dekBase64: string }> {
  const dek = await generateDek();
  const dekBase64 = await exportDek(dek);
  return { dek, dekBase64 };
}

export { importDek, exportDek };
