export type EntityIdParts = {
  readonly entityName: string;
  readonly partitionKey: string;
  readonly uniqueId: string;
};

export function parseEntityId(id: string): EntityIdParts {
  const firstDot = id.indexOf('.');
  const lastDot = id.lastIndexOf('.');
  if (firstDot === -1 || lastDot === -1 || firstDot === lastDot) {
    throw new Error(`Invalid entity ID format: ${id}`);
  }
  return {
    entityName: id.substring(0, firstDot),
    partitionKey: id.substring(firstDot + 1, lastDot),
    uniqueId: id.substring(lastDot + 1),
  };
}

export function buildEntityId(entityName: string, partitionKey: string, uniqueId: string): string {
  return `${entityName}.${partitionKey}.${uniqueId}`;
}

export function getEntityKey(id: string): string {
  const lastDot = id.lastIndexOf('.');
  if (lastDot === -1) {
    throw new Error(`Invalid entity ID format: ${id}`);
  }
  return id.substring(0, lastDot);
}

export function buildEntityKey(entityName: string, partitionKey: string): string {
  return `${entityName}.${partitionKey}`;
}
