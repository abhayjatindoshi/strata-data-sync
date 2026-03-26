export function migrateEntity(
  entity: Record<string, unknown>,
  storedVersion: number,
  targetVersion: number,
  migrations: Record<number, (entity: unknown) => unknown>,
): Record<string, unknown> {
  let current: unknown = entity;
  for (let v = storedVersion + 1; v <= targetVersion; v++) {
    const fn = migrations[v];
    if (!fn) {
      throw new Error(`Missing migration function for version ${v}`);
    }
    current = fn(current);
  }
  return current as Record<string, unknown>;
}
