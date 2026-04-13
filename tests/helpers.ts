import { resolveOptions } from '@strata/options';
import type { ResolvedStrataOptions } from '@strata/options';
import { MemoryStorageAdapter, NOOP_ENCRYPTION_SERVICE, InvalidEncryptionKeyError } from '@strata/adapter';
import type { StorageAdapter, EncryptionService, EncryptionStrategy, EncryptionKeys } from '@strata/adapter';
import { EncryptedDataAdapter } from '@strata/persistence';
import type { DataAdapter } from '@strata/persistence';
import { TenantContext } from '@strata/tenant';
import {
  pbkdf2DeriveKeyWithSalt, aesGcmGenerateKey, exportCryptoKey, importAesGcmKey,
  aesGcmEncrypt, aesGcmDecrypt,
} from '@strata/utils';

export const DEFAULT_OPTIONS: ResolvedStrataOptions = resolveOptions();

const sharedContext = new TenantContext();

export function createDataAdapter(): DataAdapter {
  return new EncryptedDataAdapter(new MemoryStorageAdapter(), NOOP_ENCRYPTION_SERVICE, sharedContext);
}

export function wrapAdapter(adapter: StorageAdapter): DataAdapter {
  return new EncryptedDataAdapter(adapter, NOOP_ENCRYPTION_SERVICE, sharedContext);
}

// ── Test encryption helpers (mirrors Pbkdf2EncryptionService + AesGcmEncryptionStrategy) ──

const SALT_LENGTH = 16;

type Pbkdf2Keys = {
  readonly kek: CryptoKey;
  readonly dek: CryptoKey | null;
  readonly salt: Uint8Array;
};

class TestAesGcmStrategy implements EncryptionStrategy<CryptoKey> {
  async encrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    return aesGcmEncrypt(data, key);
  }
  async decrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    try { return await aesGcmDecrypt(data, key); }
    catch { throw new InvalidEncryptionKeyError(); }
  }
}

export function createTestEncryptionService(): EncryptionService {
  const strategy = new TestAesGcmStrategy();
  const tenantKey = '__tenants';
  const markerKey = '__strata';

  function castKeys(keys: EncryptionKeys | null): Pbkdf2Keys | null {
    if (keys === null) return null;
    if (typeof keys !== 'object' || !('kek' in (keys as Record<string, unknown>))) {
      throw new Error('Invalid encryption keys');
    }
    return keys as Pbkdf2Keys;
  }

  return {
    targets: ['local'] as const,

    async encrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array> {
      if (blobKey === tenantKey) return data;
      const k = castKeys(keys);
      if (!k) return data;
      if (blobKey === markerKey) {
        const ct = await strategy.encrypt(data, k.kek);
        const result = new Uint8Array(SALT_LENGTH + ct.length);
        result.set(k.salt, 0);
        result.set(ct, SALT_LENGTH);
        return result;
      }
      if (!k.dek) throw new Error('DEK not loaded');
      return strategy.encrypt(data, k.dek);
    },

    async decrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array> {
      if (blobKey === tenantKey) return data;
      const k = castKeys(keys);
      if (!k) return data;
      if (blobKey === markerKey) return strategy.decrypt(data.slice(SALT_LENGTH), k.kek);
      if (!k.dek) throw new Error('DEK not loaded');
      return strategy.decrypt(data, k.dek);
    },

    async deriveKeys(credential: string, appId: string, rawMarkerBytes?: Uint8Array | null): Promise<EncryptionKeys> {
      const enc = new TextEncoder();
      let salt: Uint8Array;
      if (rawMarkerBytes && rawMarkerBytes.length >= SALT_LENGTH) {
        salt = rawMarkerBytes.slice(0, SALT_LENGTH);
      } else {
        salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      }
      const appIdBytes = enc.encode(appId);
      const fullSalt = new Uint8Array(salt.length + appIdBytes.length);
      fullSalt.set(salt, 0);
      fullSalt.set(appIdBytes, salt.length);
      const kek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
      return { kek, dek: null, salt } satisfies Pbkdf2Keys;
    },

    async generateKeyData(keys: EncryptionKeys): Promise<{ keys: EncryptionKeys; keyData: Record<string, unknown> }> {
      const k = keys as Pbkdf2Keys;
      const dek = await aesGcmGenerateKey();
      const dekBase64 = await exportCryptoKey(dek);
      return { keys: { kek: k.kek, dek, salt: k.salt } satisfies Pbkdf2Keys, keyData: { dek: dekBase64 } };
    },

    async loadKeyData(keys: EncryptionKeys, data: Record<string, unknown>): Promise<EncryptionKeys> {
      const k = keys as Pbkdf2Keys;
      const dek = await importAesGcmKey(data.dek as string);
      return { kek: k.kek, dek, salt: k.salt } satisfies Pbkdf2Keys;
    },

    async rekey(keys: EncryptionKeys, credential: string, appId: string): Promise<{ keys: EncryptionKeys; keyData: Record<string, unknown> }> {
      const k = keys as Pbkdf2Keys;
      if (!k.dek) throw new Error('No DEK loaded');
      const enc = new TextEncoder();
      const newSalt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      const appIdBytes = enc.encode(appId);
      const fullSalt = new Uint8Array(newSalt.length + appIdBytes.length);
      fullSalt.set(newSalt, 0);
      fullSalt.set(appIdBytes, newSalt.length);
      const newKek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
      const dekBase64 = await exportCryptoKey(k.dek);
      return { keys: { kek: newKek, dek: k.dek, salt: newSalt } satisfies Pbkdf2Keys, keyData: { dek: dekBase64 } };
    },
  };
}



