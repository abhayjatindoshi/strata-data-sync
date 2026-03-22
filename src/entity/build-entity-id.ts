export function buildEntityId(
  entityName: string,
  partitionKey: string,
  uniqueId: string,
): string {
  if (entityName.includes('.')) {
    throw new Error('Entity name must not contain dots');
  }
  if (partitionKey.includes('.')) {
    throw new Error('Partition key must not contain dots');
  }
  if (uniqueId.includes('.')) {
    throw new Error('Unique ID must not contain dots');
  }
  return `${entityName}.${partitionKey}.${uniqueId}`;
}
