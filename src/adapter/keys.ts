export const TENANTS_KEY = '__tenants';
export const STRATA_MARKER_KEY = '__strata';
export const INDEX_KEY = '__index';

export function partitionBlobKey(entityName: string, partition: string): string {
  return `${entityName}.${partition}`;
}
