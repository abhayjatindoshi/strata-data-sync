import debug from 'debug';
import type { BlobTransform, Tenant } from './types';
import { TENANTS_KEY, STRATA_MARKER_KEY } from './keys';
import {
  deriveKey, generateDek, exportDek, importDek,
  encrypt as encryptData, decrypt as decryptData,
  InvalidEncryptionKeyError,
} from './crypto';

const log = debug('strata:encryption');

export class EncryptionTransformService {
  private markerKey: CryptoKey | null = null;
  private dek: CryptoKey | null = null;

  async setup(
    password: string,
    appId: string,
  ): Promise<void> {
    this.markerKey = await deriveKey(password, appId);
    this.dek = null;
    log('marker key derived for app %s', appId);
  }

  setDek(dek: CryptoKey): void {
    this.dek = dek;
  }

  clear(): void {
    this.markerKey = null;
    this.dek = null;
  }

  get isConfigured(): boolean {
    return this.markerKey !== null;
  }

  toTransform(): BlobTransform {
    return {
      encode: async (_tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array> => {
        if (key === TENANTS_KEY) return data;
        if (key === STRATA_MARKER_KEY) {
          if (!this.markerKey) return data;
          return encryptData(data, this.markerKey);
        }
        if (!this.dek) return data;
        return encryptData(data, this.dek);
      },
      decode: async (_tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array> => {
        if (key === TENANTS_KEY) return data;
        if (key === STRATA_MARKER_KEY) {
          if (!this.markerKey) return data;
          try {
            return await decryptData(data, this.markerKey);
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
