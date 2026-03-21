import { describe, it, expect } from 'vitest';
import {
  defineEntity,
  composeEntityId,
  parseEntityId,
  getEntityKey,
  buildEntityKey,
  dateKeyStrategy,
} from '../../../src/index.js';
import type { Entity } from '../../../src/index.js';

type Invoice = {
  amount: number;
  currency: string;
  paid: boolean;
};

describe('Sprint 001 Integration: Full Consumer Workflow', () => {
  it('defines an entity, generates an ID, and round-trips the key', () => {
    // Step 1: Define the entity
    const invoiceDef = defineEntity<Invoice>('invoice');
    expect(invoiceDef.name).toBe('invoice');

    // Step 2: Create a key strategy
    const strategy = dateKeyStrategy({ period: 'month' });

    // Step 3: Create an entity record
    const now = new Date('2025-09-15T14:30:00Z');
    const invoiceData = {
      amount: 99.99,
      currency: 'USD',
      paid: false,
      createdAt: now,
    };

    // Step 4: Compose the entity ID using the strategy and entity name
    const id = composeEntityId(strategy, invoiceDef.name, invoiceData);

    // Step 5: Parse the ID back
    const parts = parseEntityId(id);
    expect(parts.entityName).toBe('invoice');
    expect(parts.partitionKey).toBe('2025-09');
    expect(parts.uniqueId).toHaveLength(8);

    // Step 6: Extract and verify the entity key
    const key = getEntityKey(id);
    expect(key).toBe(buildEntityKey('invoice', '2025-09'));

    // Step 7: Construct a full entity object
    const invoice: Entity<Invoice> = {
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
      device: 'server-01',
      amount: 99.99,
      currency: 'USD',
      paid: false,
    };

    expect(invoice.id).toBe(id);
    expect(invoice.amount).toBe(99.99);
  });

  it('supports multiple entity types with independent strategies', () => {
    const invoiceDef = defineEntity<Invoice>('invoice');
    const logDef = defineEntity<{ message: string }>('log');

    const monthStrategy = dateKeyStrategy({ period: 'month' });
    const dayStrategy = dateKeyStrategy({ period: 'day' });

    const date = new Date('2025-07-04T08:00:00Z');

    const invoiceId = composeEntityId(monthStrategy, invoiceDef.name, { createdAt: date });
    const logId = composeEntityId(dayStrategy, logDef.name, { createdAt: date });

    const invoiceParts = parseEntityId(invoiceId);
    const logParts = parseEntityId(logId);

    expect(invoiceParts.entityName).toBe('invoice');
    expect(invoiceParts.partitionKey).toBe('2025-07');

    expect(logParts.entityName).toBe('log');
    expect(logParts.partitionKey).toBe('2025-07-04');
  });

  it('partition key encoding preserves separators correctly', () => {
    // Partition keys with dashes should not conflict with the dot separator
    // Use a mid-day date to avoid timezone boundary issues (see BUG-001)
    const strategy = dateKeyStrategy({ period: 'day' });
    const date = new Date(2025, 5, 15, 12, 0, 0); // June 15, 2025 noon local
    const id = composeEntityId(strategy, 'event', { createdAt: date });

    const parts = parseEntityId(id);
    expect(parts.entityName).toBe('event');
    expect(parts.partitionKey).toBe('2025-06-15');
    expect(parts.uniqueId).toBeTruthy();

    // Rebuild should yield the same ID
    const rebuilt = `${parts.entityName}.${parts.partitionKey}.${parts.uniqueId}`;
    expect(rebuilt).toBe(id);
  });
});
