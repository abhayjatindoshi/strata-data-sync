import { describe, it, expect } from 'vitest';
import { migrateBlob } from '@strata/schema/migration';
import type { BlobMigration } from '@strata/schema/migration';
import type { PartitionBlob } from '@strata/persistence';

describe('Schema migration', () => {
  describe('migrateBlob', () => {
    it('applies single migration step', () => {
      const blob: PartitionBlob = {
        __v: 1,
        item: { id1: { id: 'id1', name: 'alice' } },
        deleted: {},
      };
      const migrations: BlobMigration[] = [
        {
          version: 2,
          migrate: (b) => {
            const items = b['item'] as Record<string, Record<string, unknown>>;
            const migrated: Record<string, unknown> = {};
            for (const [id, entity] of Object.entries(items)) {
              migrated[id] = { ...entity, displayName: String(entity.name).toUpperCase() };
            }
            return { ...b, item: migrated };
          },
        },
      ];
      const result = migrateBlob(blob, migrations);
      const entity = (result['item'] as Record<string, Record<string, unknown>>)['id1'];
      expect(entity.displayName).toBe('ALICE');
      expect(result.__v).toBe(2);
    });

    it('applies sequential migration steps', () => {
      const blob: PartitionBlob = {
        __v: 1,
        item: { id1: { id: 'id1', value: 10 } },
        deleted: {},
      };
      const migrations: BlobMigration[] = [
        {
          version: 2,
          migrate: (b) => {
            const items = b['item'] as Record<string, Record<string, unknown>>;
            const migrated: Record<string, unknown> = {};
            for (const [id, entity] of Object.entries(items)) {
              migrated[id] = { ...entity, value: (entity.value as number) * 2 };
            }
            return { ...b, item: migrated };
          },
        },
        {
          version: 3,
          migrate: (b) => {
            const items = b['item'] as Record<string, Record<string, unknown>>;
            const migrated: Record<string, unknown> = {};
            for (const [id, entity] of Object.entries(items)) {
              migrated[id] = { ...entity, value: (entity.value as number) + 5 };
            }
            return { ...b, item: migrated };
          },
        },
      ];
      const result = migrateBlob(blob, migrations);
      const entity = (result['item'] as Record<string, Record<string, unknown>>)['id1'];
      // v1→v2: 10*2=20, v2→v3: 20+5=25
      expect(entity.value).toBe(25);
      expect(result.__v).toBe(3);
    });

    it('no-op when blob version matches latest migration', () => {
      const blob: PartitionBlob = {
        __v: 2,
        item: { id1: { id: 'id1', name: 'test' } },
        deleted: {},
      };
      const migrations: BlobMigration[] = [
        { version: 2, migrate: (b) => b },
      ];
      const result = migrateBlob(blob, migrations);
      expect(result).toBe(blob);
      expect(result.__v).toBe(2);
    });

    it('no-op when no migrations provided', () => {
      const blob: PartitionBlob = {
        __v: 1,
        item: { id1: { id: 'id1' } },
        deleted: {},
      };
      const result = migrateBlob(blob, []);
      expect(result).toBe(blob);
    });

    it('defaults to version 0 when __v is missing', () => {
      const blob: PartitionBlob = {
        item: { id1: { id: 'id1', name: 'old' } },
        deleted: {},
      };
      const migrations: BlobMigration[] = [
        {
          version: 1,
          migrate: (b) => {
            const items = b['item'] as Record<string, Record<string, unknown>>;
            const migrated: Record<string, unknown> = {};
            for (const [id, entity] of Object.entries(items)) {
              migrated[id] = { ...entity, upgraded: true };
            }
            return { ...b, item: migrated };
          },
        },
      ];
      const result = migrateBlob(blob, migrations);
      const entity = (result['item'] as Record<string, Record<string, unknown>>)['id1'];
      expect(entity.upgraded).toBe(true);
      expect(result.__v).toBe(1);
    });

    it('applies only migrations above stored version', () => {
      const blob: PartitionBlob = {
        __v: 2,
        item: { id1: { id: 'id1', value: 10 } },
        deleted: {},
      };
      const migrations: BlobMigration[] = [
        { version: 1, migrate: () => { throw new Error('should not run'); } },
        { version: 2, migrate: () => { throw new Error('should not run'); } },
        {
          version: 3,
          migrate: (b) => {
            const items = b['item'] as Record<string, Record<string, unknown>>;
            const migrated: Record<string, unknown> = {};
            for (const [id, entity] of Object.entries(items)) {
              migrated[id] = { ...entity, v3: true };
            }
            return { ...b, item: migrated };
          },
        },
      ];
      const result = migrateBlob(blob, migrations);
      const entity = (result['item'] as Record<string, Record<string, unknown>>)['id1'];
      expect(entity.v3).toBe(true);
      expect(result.__v).toBe(3);
    });
  });
});
