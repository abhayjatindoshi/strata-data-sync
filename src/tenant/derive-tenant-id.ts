import { fnvHash } from '../persistence/index.js';

export function deriveTenantId(
  cloudMeta: Readonly<Record<string, unknown>>,
): string {
  const sorted = Object.keys(cloudMeta).sort();
  const input = sorted.map(k => `${k}=${String(cloudMeta[k])}`).join('|');
  return fnvHash(input).toString(36);
}
