const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 8;

export function generateId(length: number = DEFAULT_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) {
    result += ALPHABET[byte % ALPHABET.length]!;
  }
  return result;
}
