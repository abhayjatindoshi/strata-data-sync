import { toArrayBuffer } from '@strata/utils';

// ─── Errors ──────────────────────────────────────────────

export class InvalidEncryptionKeyError extends Error {
  constructor(message = 'Invalid encryption key') {
    super(message);
    this.name = 'InvalidEncryptionKeyError';
  }
}

// ─── Constants ───────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12;
const ENCRYPTION_VERSION = 1;

const textEncoder = new TextEncoder();

// ─── Key derivation ─────────────────────────────────────

export async function deriveKey(
  password: string,
  appId: string,
): Promise<CryptoKey> {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(textEncoder.encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const salt = textEncoder.encode(appId);

  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── DEK generation ─────────────────────────────────────

export async function generateDek(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportDek(dek: CryptoKey): Promise<string> {
  const raw = await globalThis.crypto.subtle.exportKey('raw', dek);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importDek(base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(raw),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ─── AES-256-GCM encrypt / decrypt ─────────────────────

export async function encrypt(
  data: Uint8Array,
  dek: CryptoKey,
): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    dek,
    toArrayBuffer(data),
  );
  const result = new Uint8Array(1 + IV_LENGTH + ciphertext.byteLength);
  result[0] = ENCRYPTION_VERSION;
  result.set(iv, 1);
  result.set(new Uint8Array(ciphertext), 1 + IV_LENGTH);
  return result;
}

export async function decrypt(
  data: Uint8Array,
  dek: CryptoKey,
): Promise<Uint8Array> {
  const version = data[0];
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  const iv = data.slice(1, 1 + IV_LENGTH);
  const ciphertext = data.slice(1 + IV_LENGTH);
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    dek,
    toArrayBuffer(ciphertext),
  );
  return new Uint8Array(plaintext);
}
