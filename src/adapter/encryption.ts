import debug from 'debug';
import type { EncryptionStrategy, EncryptionService, EncryptionKeys } from './types';
import {
  pbkdf2DeriveKeyWithSalt, aesGcmGenerateKey, exportCryptoKey, importAesGcmKey,
  aesGcmEncrypt, aesGcmDecrypt,
} from '@strata/utils';

const log = debug('strata:encryption');

const SALT_LENGTH = 16;

export class InvalidEncryptionKeyError extends Error {
  constructor(message = 'Invalid encryption key') {
    super(message);
    this.name = 'InvalidEncryptionKeyError';
  }
}

// ── Strategy: stateless AES-GCM crypto ───────────────────

export class AesGcmEncryptionStrategy implements EncryptionStrategy<CryptoKey> {
  async encrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    return aesGcmEncrypt(data, key);
  }

  async decrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    try {
      return await aesGcmDecrypt(data, key);
    } catch {
      throw new InvalidEncryptionKeyError();
    }
  }
}

// ── Keys type for Pbkdf2 implementation ──────────────────

type Pbkdf2Keys = {
  readonly kek: CryptoKey;
  readonly dek: CryptoKey | null;
  readonly salt: Uint8Array;
};

// ── Service: stateless PBKDF2 key derivation + KEK/DEK ───

export class Pbkdf2EncryptionService implements EncryptionService {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  private readonly strategy: EncryptionStrategy<CryptoKey>;
  private readonly tenantKey: string;
  private readonly markerKey: string;

  constructor(options: {
    readonly targets: ReadonlyArray<'local' | 'cloud'>;
    readonly strategy: EncryptionStrategy<CryptoKey>;
    readonly tenantKey?: string;
    readonly markerKey?: string;
  }) {
    this.targets = options.targets;
    this.strategy = options.strategy;
    this.tenantKey = options.tenantKey ?? '__tenants';
    this.markerKey = options.markerKey ?? '__strata';
  }

  private castKeys(keys: EncryptionKeys | null): Pbkdf2Keys | null {
    return keys as Pbkdf2Keys | null;
  }

  // ── Encrypt / Decrypt (stateless — keys passed in) ─────
  //
  // Key semantics:
  //   keys === null       → unencrypted tenant, pass data through unchanged
  //   keys.kek only       → marker blob can be encrypted/decrypted with KEK
  //   keys.dek === null   → lifecycle error, DEK not yet loaded — throw
  //   keys.dek present    → partition data encrypted/decrypted with DEK
  //
  // The tenant list key is always unencrypted so tenants can be
  // enumerated before authentication.

  async encrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array> {
    if (blobKey === this.tenantKey) return data; // always unencrypted
    const k = this.castKeys(keys);
    if (!k) return data; // unencrypted tenant
    if (blobKey === this.markerKey) {
      const ciphertext = await this.strategy.encrypt(data, k.kek);
      const result = new Uint8Array(SALT_LENGTH + ciphertext.length);
      result.set(k.salt, 0);
      result.set(ciphertext, SALT_LENGTH);
      return result;
    }
    if (!k.dek) throw new Error('DEK not loaded — cannot encrypt partition data');
    return this.strategy.encrypt(data, k.dek);
  }

  async decrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array> {
    if (blobKey === this.tenantKey) return data; // always unencrypted
    const k = this.castKeys(keys);
    if (!k) return data; // unencrypted tenant
    if (blobKey === this.markerKey) {
      const ciphertext = data.slice(SALT_LENGTH);
      return this.strategy.decrypt(ciphertext, k.kek);
    }
    if (!k.dek) throw new Error('DEK not loaded — cannot decrypt partition data');
    return this.strategy.decrypt(data, k.dek);
  }

  // ── Key management (stateless — returns new keys) ──────

  async deriveKeys(credential: string, appId: string, rawMarkerBytes?: Uint8Array | null): Promise<EncryptionKeys> {
    const textEncoder = new TextEncoder();
    let salt: Uint8Array;
    if (rawMarkerBytes && rawMarkerBytes.length >= SALT_LENGTH) {
      salt = rawMarkerBytes.slice(0, SALT_LENGTH);
    } else {
      salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    }
    const appIdBytes = textEncoder.encode(appId);
    const fullSalt = new Uint8Array(salt.length + appIdBytes.length);
    fullSalt.set(salt, 0);
    fullSalt.set(appIdBytes, salt.length);
    const kek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
    log('KEK derived for app %s', appId);
    return { kek, dek: null, salt } satisfies Pbkdf2Keys;
  }

  async generateKeyData(keys: EncryptionKeys): Promise<{ keys: EncryptionKeys; keyData: Record<string, unknown> }> {
    const k = keys as Pbkdf2Keys;
    const dek = await aesGcmGenerateKey();
    const dekBase64 = await exportCryptoKey(dek);
    return {
      keys: { kek: k.kek, dek, salt: k.salt } satisfies Pbkdf2Keys,
      keyData: { dek: dekBase64 },
    };
  }

  async loadKeyData(keys: EncryptionKeys, data: Record<string, unknown>): Promise<EncryptionKeys> {
    const k = keys as Pbkdf2Keys;
    const dek = await importAesGcmKey(data.dek as string);
    return { kek: k.kek, dek, salt: k.salt } satisfies Pbkdf2Keys;
  }

  async rekey(keys: EncryptionKeys, credential: string, appId: string): Promise<{ keys: EncryptionKeys; keyData: Record<string, unknown> }> {
    const k = keys as Pbkdf2Keys;
    if (!k.dek) throw new Error('No DEK loaded — cannot rekey');
    const textEncoder = new TextEncoder();
    const newSalt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const appIdBytes = textEncoder.encode(appId);
    const fullSalt = new Uint8Array(newSalt.length + appIdBytes.length);
    fullSalt.set(newSalt, 0);
    fullSalt.set(appIdBytes, newSalt.length);
    const newKek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
    const dekBase64 = await exportCryptoKey(k.dek);
    return {
      keys: { kek: newKek, dek: k.dek, salt: newSalt } satisfies Pbkdf2Keys,
      keyData: { dek: dekBase64 },
    };
  }
}

