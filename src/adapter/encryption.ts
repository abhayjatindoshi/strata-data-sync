import debug from 'debug';
import type { BlobTransform, StorageAdapter } from './types';
import {
  deriveKek, generateDek, wrapDek, unwrapDek,
  encrypt as encryptData, decrypt as decryptData,
} from './crypto';

const log = debug('strata:encryption');

const SALT_KEY = '__strata_salt';
const DEK_KEY = '__strata_dek';

export type EncryptionContext = {
  readonly dek: CryptoKey;
  readonly salt: Uint8Array;
  readonly encrypt: (data: Uint8Array) => Promise<Uint8Array>;
  readonly decrypt: (data: Uint8Array) => Promise<Uint8Array>;
};

export function encryptionTransform(ctx: EncryptionContext): BlobTransform {
  return { encode: ctx.encrypt, decode: ctx.decrypt };
}

function nsKey(appId: string, key: string): string {
  return `${appId}/${key}`;
}

export async function initEncryption(
  storage: StorageAdapter,
  appId: string,
  password: string,
): Promise<EncryptionContext> {
  const existingSalt = await storage.read(undefined, nsKey(appId, SALT_KEY));

  if (existingSalt) {
    log('loading existing encryption keys');
    const wrappedDek = await storage.read(undefined, nsKey(appId, DEK_KEY));
    if (!wrappedDek) {
      throw new Error('Encryption salt found but wrapped DEK is missing');
    }
    const kek = await deriveKek(password, existingSalt, appId);
    const dek = await unwrapDek(wrappedDek, kek);
    return buildContext(dek, existingSalt);
  }

  log('bootstrapping new encryption keys');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const dek = await generateDek();
  const kek = await deriveKek(password, salt, appId);
  const wrapped = await wrapDek(dek, kek);
  await storage.write(undefined, nsKey(appId, SALT_KEY), salt);
  await storage.write(undefined, nsKey(appId, DEK_KEY), wrapped);
  return buildContext(dek, salt);
}

export async function changeEncryptionPassword(
  storage: StorageAdapter,
  appId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const salt = await storage.read(undefined, nsKey(appId, SALT_KEY));
  if (!salt) throw new Error('No encryption configured');
  const wrappedDek = await storage.read(undefined, nsKey(appId, DEK_KEY));
  if (!wrappedDek) throw new Error('Wrapped DEK is missing');

  const oldKek = await deriveKek(oldPassword, salt, appId);
  const dek = await unwrapDek(wrappedDek, oldKek);
  const newKek = await deriveKek(newPassword, salt, appId);
  const newWrapped = await wrapDek(dek, newKek);
  await storage.write(undefined, nsKey(appId, DEK_KEY), newWrapped);
  log('encryption password changed');
}

export async function enableEncryption(
  storage: StorageAdapter,
  appId: string,
  password: string,
): Promise<EncryptionContext> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const dek = await generateDek();
  const kek = await deriveKek(password, salt, appId);
  const wrapped = await wrapDek(dek, kek);

  const ctx = buildContext(dek, salt);
  const keys = await storage.list(undefined, `${appId}/`);
  for (const key of keys) {
    const raw = await storage.read(undefined, key);
    if (raw) {
      const encrypted = await ctx.encrypt(raw);
      await storage.write(undefined, key, encrypted);
    }
  }

  await storage.write(undefined, nsKey(appId, SALT_KEY), salt);
  await storage.write(undefined, nsKey(appId, DEK_KEY), wrapped);
  log('encryption enabled');
  return ctx;
}

export async function disableEncryption(
  storage: StorageAdapter,
  appId: string,
  password: string,
): Promise<void> {
  const salt = await storage.read(undefined, nsKey(appId, SALT_KEY));
  if (!salt) throw new Error('No encryption configured');
  const wrappedDek = await storage.read(undefined, nsKey(appId, DEK_KEY));
  if (!wrappedDek) throw new Error('Wrapped DEK is missing');

  const kek = await deriveKek(password, salt, appId);
  const dek = await unwrapDek(wrappedDek, kek);
  const ctx = buildContext(dek, salt);

  const keys = await storage.list(undefined, `${appId}/`);
  for (const key of keys) {
    if (key === nsKey(appId, SALT_KEY) || key === nsKey(appId, DEK_KEY)) continue;
    const raw = await storage.read(undefined, key);
    if (raw) {
      const decrypted = await ctx.decrypt(raw);
      await storage.write(undefined, key, decrypted);
    }
  }

  await storage.delete(undefined, nsKey(appId, SALT_KEY));
  await storage.delete(undefined, nsKey(appId, DEK_KEY));
  log('encryption disabled');
}

function buildContext(dek: CryptoKey, salt: Uint8Array): EncryptionContext {
  return {
    dek,
    salt,
    encrypt: (data: Uint8Array) => encryptData(data, dek),
    decrypt: (data: Uint8Array) => decryptData(data, dek),
  };
}
