import { describe, it, expect } from 'vitest';
import { validateConfig } from './validate-config.js';
import { MemoryBlobAdapter } from '../adapter/index.js';
import { defineEntity } from '../schema/index.js';
import { global } from '../key-strategy/index.js';
import type { StrataConfig } from './types.js';
import type { BaseEntity } from '../entity/index.js';

type TestEntity = BaseEntity & { readonly title: string };

const testDef = defineEntity<TestEntity>('todo', { keyStrategy: global });

function makeConfig(overrides: Partial<StrataConfig> = {}): StrataConfig {
  return {
    entities: [testDef],
    localAdapter: new MemoryBlobAdapter(),
    nodeId: 'node-1',
    ...overrides,
  };
}

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    expect(() => validateConfig(makeConfig())).not.toThrow();
  });

  it('rejects empty entities array', () => {
    expect(() => validateConfig(makeConfig({ entities: [] }))).toThrow(
      'entities array must not be empty',
    );
  });

  it('rejects empty nodeId', () => {
    expect(() => validateConfig(makeConfig({ nodeId: '' }))).toThrow(
      'nodeId must not be empty',
    );
  });

  it('rejects whitespace-only nodeId', () => {
    expect(() => validateConfig(makeConfig({ nodeId: '  ' }))).toThrow(
      'nodeId must not be empty',
    );
  });

  it('rejects duplicate entity names', () => {
    const dup = defineEntity<TestEntity>('todo', { keyStrategy: global });
    expect(() =>
      validateConfig(makeConfig({ entities: [testDef, dup] })),
    ).toThrow('Duplicate entity name: todo');
  });
});
