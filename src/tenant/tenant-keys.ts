export const TENANT_LIST_KEY = '__tenants';

export function scopeEntityKey(tenantId: string, entityKey: string): string {
  return `tenant:${tenantId}:${entityKey}`;
}

export function scopeMetadataKey(tenantId: string): string {
  return `tenant:${tenantId}:__metadata`;
}

export function unscopeEntityKey(scopedKey: string): { tenantId: string; entityKey: string } | undefined {
  if (!scopedKey.startsWith('tenant:')) return undefined;
  const firstColon = scopedKey.indexOf(':');
  const secondColon = scopedKey.indexOf(':', firstColon + 1);
  if (secondColon === -1) return undefined;
  return {
    tenantId: scopedKey.substring(firstColon + 1, secondColon),
    entityKey: scopedKey.substring(secondColon + 1),
  };
}

export function scopePrefix(tenantId: string): string {
  return `tenant:${tenantId}:`;
}
