import { describe, it, expect, expectTypeOf } from 'vitest';
import { defineEntity, type EntityDef } from '@strata/schema/entity-def';
import type { Entity } from '@strata/entity/base-entity';

describe('defineEntity', () => {
  it('returns an object with the given name', () => {
    const def = defineEntity<{ amount: number }>('Transaction');
    expect(def.name).toBe('Transaction');
  });

  it('runtime object only has name property', () => {
    const def = defineEntity<{ amount: number }>('Account');
    expect(Object.keys(def)).toEqual(['name']);
  });
});

describe('EntityDef type inference', () => {
  const Transaction = defineEntity<{
    amount: number;
    date: Date;
    accountId: string;
  }>('Transaction');

  it('carries phantom type for fields', () => {
    type TxnFields = (typeof Transaction) extends EntityDef<string, infer F> ? F : never;
    expectTypeOf<TxnFields>().toEqualTypeOf<{
      amount: number;
      date: Date;
      accountId: string;
    }>();
  });

  it('composes with Entity to produce full type', () => {
    type TxnFields = (typeof Transaction) extends EntityDef<string, infer F> ? F : never;
    type TxnEntity = Entity<TxnFields>;
    expectTypeOf<TxnEntity>().toHaveProperty('id');
    expectTypeOf<TxnEntity>().toHaveProperty('amount');
    expectTypeOf<TxnEntity>().toHaveProperty('createdAt');
  });
});
