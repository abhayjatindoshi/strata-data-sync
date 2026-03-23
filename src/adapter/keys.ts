export const TENANTS_KEY = '__tenants';
export const STRATA_MARKER_KEY = '__strata';

export function indexKey(entityName: string): string {
  return `__index.${entityName}`;
}

export function partitionBlobKey(entityName: string, partition: string): string {
  return `${entityName}.${partition}`;
}
