export function partitionBlobKey(entityName: string, partition: string): string {
  return `${entityName}.${partition}`;
}
