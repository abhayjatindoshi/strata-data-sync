import { describe, it, expect } from 'vitest';
import { composeEntityId } from './compose-entity-id';
import { parseEntityId } from './entity-key';
import { dateKeyStrategy } from '@strata/key-strategy/date-key-strategy';
import type { KeyStrategy } from '@strata/key-strategy/key-strategy';

describe('composeEntityId', () => {
  it('produces a valid three-part entity ID', () => {
    const strategy = dateKeyStrategy({ period: 'year' });
    const id = composeEntityId(strategy, 'Transaction', {
      createdAt: new Date('2025-06-15T00:00:00Z'),
    });

    const parts = parseEntityId(id);
    expect(parts.entityName).toBe('Transaction');
    expect(parts.partitionKey).toBe('2025');
    expect(parts.uniqueId).toHaveLength(8);
  });

  it('generates unique IDs for the same entity and strategy', () => {
    const strategy = dateKeyStrategy({ period: 'year' });
    const entity = { createdAt: new Date('2025-01-01T00:00:00Z') };

    const ids = new Set(
      Array.from({ length: 50 }, () => composeEntityId(strategy, 'Account', entity)),
    );
    expect(ids.size).toBe(50);
  });

  it('works with a custom key strategy', () => {
    const fixedStrategy: KeyStrategy = {
      getPartitionKey: () => 'global',
      getRelevantKeys: () => [],
    };

    const id = composeEntityId(fixedStrategy, 'Account', {});
    const parts = parseEntityId(id);
    expect(parts.entityName).toBe('Account');
    expect(parts.partitionKey).toBe('global');
    expect(parts.uniqueId).toHaveLength(8);
  });
});
