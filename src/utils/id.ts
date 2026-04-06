const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function generateId(length: number = 8): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += CHARS[bytes[i] % CHARS.length];
  }
  return id;
}
