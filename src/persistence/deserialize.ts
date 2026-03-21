export type PartitionBlob = {
  readonly entities: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>;
  readonly deleted: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateDeleted(raw: unknown): Record<string, Record<string, string>> {
  if (!isPlainObject(raw)) {
    throw new Error('Invalid blob: "deleted" must be an object');
  }
  const deleted: Record<string, Record<string, string>> = {};
  for (const entityName of Object.keys(raw)) {
    const entries = raw[entityName];
    if (!isPlainObject(entries)) {
      throw new Error(`Invalid blob: deleted entries for "${entityName}" must be an object`);
    }
    deleted[entityName] = {};
    for (const entityId of Object.keys(entries)) {
      const timestamp = entries[entityId];
      if (typeof timestamp !== 'string') {
        throw new Error(`Invalid blob: deleted timestamp for "${entityId}" must be a string`);
      }
      deleted[entityName]![entityId] = timestamp;
    }
  }
  return deleted;
}

function validateEntityGroup(
  entityName: string,
  raw: unknown,
): Record<string, Record<string, unknown>> {
  if (!isPlainObject(raw)) {
    throw new Error(`Invalid blob: entries for "${entityName}" must be an object`);
  }
  const group: Record<string, Record<string, unknown>> = {};
  for (const entityId of Object.keys(raw)) {
    const entityData = raw[entityId];
    if (!isPlainObject(entityData)) {
      throw new Error(`Invalid blob: entity data for "${entityId}" must be an object`);
    }
    if (typeof entityData['id'] !== 'string') {
      throw new Error(`Invalid blob: entity "${entityId}" must have a string "id" field`);
    }
    group[entityId] = entityData;
  }
  return group;
}

export function deserialize(json: string): PartitionBlob {
  const raw: unknown = JSON.parse(json);

  if (!isPlainObject(raw)) {
    throw new Error('Invalid blob: expected an object');
  }

  const entities: Record<string, Record<string, Record<string, unknown>>> = {};
  let deleted: Record<string, Record<string, string>> = {};

  for (const key of Object.keys(raw)) {
    if (key === 'deleted') {
      deleted = validateDeleted(raw[key]);
    } else {
      entities[key] = validateEntityGroup(key, raw[key]);
    }
  }

  return { entities, deleted };
}
