import type { PartitionBlob } from '@strata/persistence';

export type BlobMigration = {
  readonly version: number;
  readonly migrate: (blob: PartitionBlob) => PartitionBlob;
};

export function migrateBlob(
  blob: PartitionBlob,
  migrations: ReadonlyArray<BlobMigration>,
): PartitionBlob {
  const storedVersion = blob.__v ?? 0;
  const sorted = [...migrations]
    .filter(m => m.version > storedVersion)
    .sort((a, b) => a.version - b.version);

  let current = blob;
  for (const m of sorted) {
    current = m.migrate(current);
  }

  if (sorted.length === 0) return current;
  const maxVersion = sorted[sorted.length - 1].version;
  return { ...current, __v: maxVersion };
}
