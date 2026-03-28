import type { PartitionBlob } from '@strata/persistence';
import type { EntityDefinition } from './types';

export type BlobMigration = {
  readonly version: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly entities?: ReadonlyArray<EntityDefinition<any>>;
  readonly migrate: (blob: PartitionBlob) => PartitionBlob;
};

export function migrateBlob(
  blob: PartitionBlob,
  migrations: ReadonlyArray<BlobMigration>,
  entityName?: string,
): PartitionBlob {
  const storedVersion = blob.__v ?? 0;
  const sorted = [...migrations]
    .filter(m => m.version > storedVersion)
    .filter(m => !entityName || !m.entities || m.entities.some(def => def.name === entityName))
    .sort((a, b) => a.version - b.version);

  let current = blob;
  for (const m of sorted) {
    current = m.migrate(current);
  }

  if (sorted.length === 0) return current;
  const maxVersion = sorted[sorted.length - 1].version;
  return { ...current, __v: maxVersion };
}
