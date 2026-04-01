export function formatEntityId(entityName: string, partitionKey: string, uniqueId: string): string {
  return `${entityName}.${partitionKey}.${uniqueId}`;
}
