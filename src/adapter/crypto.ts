// ─── Types ───────────────────────────────────────────────

export type EncryptionHeader = {
  readonly salt: Uint8Array;
  readonly encryptedDek: Uint8Array;
  readonly version: number;
};

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

function buf(data: Uint8Array): ArrayBuffer {
  // Type assertion needed for TS 5.9 Uint8Array<ArrayBufferLike> vs Web Crypto BufferSource
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

// ─── KEK derivation ─────────────────────────────────────

export async function deriveKek(
  password: string,
  salt: Uint8Array,
  appId: string,
): Promise<CryptoKey> {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    buf(textEncoder.encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const appIdBytes = textEncoder.encode(appId);
  const combinedSalt = new Uint8Array(salt.length + appIdBytes.length);
  combinedSalt.set(salt);
  combinedSalt.set(appIdBytes, salt.length);

  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf(combinedSalt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
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

// ─── DEK wrap / unwrap ──────────────────────────────────

export async function wrapDek(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<Uint8Array> {
  const rawDek = await globalThis.crypto.subtle.exportKey('raw', dek);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buf(iv) },
    kek,
    rawDek,
  );
  const result = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), IV_LENGTH);
  return result;
}

export async function unwrapDek(
  wrapped: Uint8Array,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const iv = wrapped.slice(0, IV_LENGTH);
  const ciphertext = wrapped.slice(IV_LENGTH);
  let rawDek: ArrayBuffer;
  try {
    rawDek = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf(iv) },
      kek,
      buf(ciphertext),
    );
  } catch {
    throw new InvalidEncryptionKeyError();
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    rawDek,
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
    { name: 'AES-GCM', iv: buf(iv) },
    dek,
    buf(data),
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
    { name: 'AES-GCM', iv: buf(iv) },
    dek,
    buf(ciphertext),
  );
  return new Uint8Array(plaintext);
}
