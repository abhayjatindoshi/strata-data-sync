import { describe, it, expect } from 'vitest';
import { defineEntity } from '@strata/schema/define-entity.js';
import { singleton, partitioned } from '@strata/key-strategy';
import type { KeyStrategy } from '@strata/key-strategy';
import { deriveId } from '@strata/entity';
import type { BaseEntity } from '@strata/entity';

type TestEntity = BaseEntity & {
  readonly title: string;
  readonly userId: string;
};

describe('defineEntity', () => {
  it('creates a definition with defaults', () => {
    const def = defineEntity<TestEntity>('todo');

    expect(def.name).toBe('todo');
    expect(def.keyStrategy.type).toBe('global');
    expect(def.deriveId).toBeUndefined();
  });

  it('accepts a custom key strategy', () => {
    const def = defineEntity<TestEntity>('settings', {
      keyStrategy: singleton as KeyStrategy<TestEntity>,
    });

    expect(def.keyStrategy.type).toBe('singleton');
  });

  it('accepts a partitioned key strategy', () => {
    const def = defineEntity<TestEntity>('todo', {
      keyStrategy: partitioned<TestEntity>(e => e.userId),
    });

    expect(def.keyStrategy.type).toBe('partitioned');
    const entity = { userId: 'user-1' } as TestEntity;
    expect(def.keyStrategy.getPartitionKey(entity)).toBe('user-1');
  });

  it('accepts a deriveId function', () => {
    const def = defineEntity<TestEntity>('todo', {
      deriveId: deriveId<TestEntity>(e => e.title),
    });

    expect(def.deriveId).toBeDefined();
    const entity = { title: 'my-task' } as TestEntity;
    expect(def.deriveId!(entity)).toBe('my-task');
  });
});
