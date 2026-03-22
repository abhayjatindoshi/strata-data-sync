import { describe, it, expectTypeOf } from 'vitest';
import type { BaseEntity, Entity } from '@strata/entity/base-entity';

describe('BaseEntity', () => {
  it('has expected fields', () => {
    expectTypeOf<BaseEntity>().toHaveProperty('id');
    expectTypeOf<BaseEntity>().toHaveProperty('createdAt');
    expectTypeOf<BaseEntity>().toHaveProperty('updatedAt');
    expectTypeOf<BaseEntity>().toHaveProperty('version');
    expectTypeOf<BaseEntity>().toHaveProperty('device');
  });

  it('fields have correct types', () => {
    expectTypeOf<BaseEntity['id']>().toEqualTypeOf<string>();
    expectTypeOf<BaseEntity['createdAt']>().toEqualTypeOf<Date>();
    expectTypeOf<BaseEntity['updatedAt']>().toEqualTypeOf<Date>();
    expectTypeOf<BaseEntity['version']>().toEqualTypeOf<number>();
    expectTypeOf<BaseEntity['device']>().toEqualTypeOf<string>();
  });

  it('fields are readonly', () => {
    expectTypeOf<Readonly<BaseEntity>>().toEqualTypeOf<BaseEntity>();
  });
});

describe('Entity<T>', () => {
  type TestFields = { amount: number; label: string };

  it('merges base and domain fields', () => {
    expectTypeOf<Entity<TestFields>>().toHaveProperty('id');
    expectTypeOf<Entity<TestFields>>().toHaveProperty('amount');
    expectTypeOf<Entity<TestFields>>().toHaveProperty('label');
  });

  it('domain fields have correct types', () => {
    expectTypeOf<Entity<TestFields>['amount']>().toEqualTypeOf<number>();
    expectTypeOf<Entity<TestFields>['label']>().toEqualTypeOf<string>();
  });

  it('domain fields are readonly', () => {
    expectTypeOf<Entity<TestFields>>().toMatchTypeOf<Readonly<TestFields>>();
  });
});
