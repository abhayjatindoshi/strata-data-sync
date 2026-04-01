import debug from 'debug';
import type { BlobAdapter, EncryptionStrategy, EncryptionService } from './types';
import {
  deriveKey, generateDek, exportDek, importDek,
  encrypt as encryptData, decrypt as decryptData,
  InvalidEncryptionKeyError,
} from './crypto';

const log = debug('strata:encryption');

// ── Strategy: stateless AES-GCM crypto ───────────────────

export class AesGcmEncryptionStrategy implements EncryptionStrategy<CryptoKey> {
  async encrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    return encryptData(data, key);
  }

  async decrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    try {
      return await decryptData(data, key);
    } catch {
      throw new InvalidEncryptionKeyError();
    }
  }
}

// ── Service: PBKDF2 key derivation + KEK/DEK management ─

export class Pbkdf2EncryptionService implements EncryptionService {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  private kek: CryptoKey | null = null;
  private dek: CryptoKey | null = null;
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

  // ── Encrypt / Decrypt (delegates to strategy) ──────────

  async encrypt(blobKey: string, data: Uint8Array): Promise<Uint8Array> {
    if (blobKey === this.tenantKey) return data;
    if (blobKey === this.markerKey) {
      if (!this.kek) return data;
      return this.strategy.encrypt(data, this.kek);
    }
    if (!this.dek) return data;
    return this.strategy.encrypt(data, this.dek);
  }

  async decrypt(blobKey: string, data: Uint8Array): Promise<Uint8Array> {
    if (blobKey === this.tenantKey) return data;
    if (blobKey === this.markerKey) {
      if (!this.kek) return data;
      return this.strategy.decrypt(data, this.kek);
    }
    if (!this.dek) return data;
    return this.strategy.decrypt(data, this.dek);
  }

  // ── Lifecycle ──────────────────────────────────────────

  async activate(credential: string, appId: string): Promise<void> {
    this.kek = await deriveKey(credential, appId);
    this.dek = null;
    log('KEK derived for app %s', appId);
  }

  async generateKeyData(): Promise<Record<string, unknown>> {
    const dek = await generateDek();
    this.dek = dek;
    const dekBase64 = await exportDek(dek);
    return { dek: dekBase64 };
  }

  async loadKeyData(data: Record<string, unknown>): Promise<void> {
    this.dek = await importDek(data.dek as string);
  }

  async rekey(credential: string, appId: string): Promise<Record<string, unknown>> {
    const currentDek = this.dek;
    if (!currentDek) throw new Error('No DEK loaded — cannot rekey');
    this.kek = await deriveKey(credential, appId);
    const dekBase64 = await exportDek(currentDek);
    return { dek: dekBase64 };
  }

  deactivate(): void {
    this.kek = null;
    this.dek = null;
  }

  get isActive(): boolean {
    return this.kek !== null;
  }
}

// ── withEncryption decorator ─────────────────────────────

export function withEncryption(
  adapter: BlobAdapter,
  service: EncryptionService,
): BlobAdapter {
  return {
    async read(tenant, key) {
      const raw = await adapter.read(tenant, key);
      if (!raw) return null;
      return service.decrypt(key, raw);
    },
    async write(tenant, key, data) {
      const encrypted = await service.encrypt(key, data);
      await adapter.write(tenant, key, encrypted);
    },
    delete: (t, k) => adapter.delete(t, k),
    list: (t, p) => adapter.list(t, p),
  };
}

export { importDek, exportDek };
