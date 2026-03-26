import { describe, it, expect } from 'vitest';
import { migrateEntity } from '@strata/schema/migration';
import { defineEntity } from '@strata/schema';

describe('Schema migration', () => {
  describe('migrateEntity', () => {
    it('applies single migration step', () => {
      const entity = { id: '1', name: 'alice' };
      const migrations = {
        2: (e: unknown) => ({ ...(e as Record<string, unknown>), displayName: (e as { name: string }).name.toUpperCase() }),
      };
      const result = migrateEntity(entity, 1, 2, migrations);
      expect(result).toEqual({ id: '1', name: 'alice', displayName: 'ALICE' });
    });

    it('applies sequential migration steps', () => {
      const entity = { id: '1', value: 10 };
      const migrations = {
        2: (e: unknown) => ({ ...(e as Record<string, unknown>), value: (e as { value: number }).value * 2 }),
        3: (e: unknown) => ({ ...(e as Record<string, unknown>), value: (e as { value: number }).value + 5 }),
      };
      const result = migrateEntity(entity, 1, 3, migrations);
      // v1→v2: 10*2=20, v2→v3: 20+5=25
      expect(result).toEqual({ id: '1', value: 25 });
    });

    it('throws when migration function is missing', () => {
      const entity = { id: '1' };
      const migrations = {
        3: (e: unknown) => e as Record<string, unknown>,
      };
      // Missing migration for version 2
      expect(() => migrateEntity(entity, 1, 3, migrations))
        .toThrow('Missing migration function for version 2');
    });

    it('no-op when storedVersion equals targetVersion', () => {
      const entity = { id: '1', name: 'test' };
      const migrations = {};
      const result = migrateEntity(entity, 2, 2, migrations);
      expect(result).toEqual(entity);
    });
  });

  describe('defineEntity with version', () => {
    it('defaults to version 1', () => {
      type T = { name: string };
      const def = defineEntity<T>('test');
      expect(def.version).toBe(1);
    });

    it('accepts custom version', () => {
      type T = { name: string };
      const def = defineEntity<T>('test', { version: 3 });
      expect(def.version).toBe(3);
    });

    it('stores migrations in definition', () => {
      type T = { name: string; displayName?: string };
      const migrations = {
        2: (e: unknown) => ({ ...(e as Record<string, unknown>), displayName: 'default' }),
      };
      const def = defineEntity<T>('test', { version: 2, migrations });
      expect(def.migrations).toBe(migrations);
    });
  });
});
