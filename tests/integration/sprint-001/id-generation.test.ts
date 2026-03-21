import { describe, it, expect } from 'vitest';
import {
  generateId,
  composeEntityId,
  dateKeyStrategy,
} from '../../../src/index.js';

describe('Sprint 001 Integration: ID Generation with DateKeyStrategy', () => {
  it('generates unique IDs of default length', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).toHaveLength(8);
    expect(id2).toHaveLength(8);
    expect(id1).not.toBe(id2);
  });

  it('generates IDs of custom length', () => {
    const id = generateId(16);
    expect(id).toHaveLength(16);
  });

  it('composeEntityId produces correctly formatted ID with month strategy', () => {
    const strategy = dateKeyStrategy({ period: 'month' });
    const entity = { createdAt: new Date('2025-06-15T12:00:00Z') };
    const id = composeEntityId(strategy, 'invoice', entity);

    // ID format: entityName.partitionKey.uniqueId
    expect(id).toMatch(/^invoice\.2025-06\.[A-Za-z0-9]{8}$/);
  });

  it('composeEntityId produces correctly formatted ID with year strategy', () => {
    const strategy = dateKeyStrategy({ period: 'year' });
    const entity = { createdAt: new Date('2024-01-01T00:00:00Z') };
    const id = composeEntityId(strategy, 'report', entity);

    expect(id).toMatch(/^report\.2024\.[A-Za-z0-9]{8}$/);
  });

  it('composeEntityId produces correctly formatted ID with day strategy', () => {
    const strategy = dateKeyStrategy({ period: 'day' });
    const entity = { createdAt: new Date('2025-03-21T10:30:00Z') };
    const id = composeEntityId(strategy, 'log', entity);

    expect(id).toMatch(/^log\.2025-03-21\.[A-Za-z0-9]{8}$/);
  });

  it('composeEntityId uses custom date field', () => {
    const strategy = dateKeyStrategy({ period: 'month', field: 'publishedAt' });
    const entity = { publishedAt: new Date('2025-11-05T08:00:00Z') };
    const id = composeEntityId(strategy, 'article', entity);

    expect(id).toMatch(/^article\.2025-11\.[A-Za-z0-9]{8}$/);
  });

  it('composeEntityId falls back to current date when field is missing', () => {
    const strategy = dateKeyStrategy({ period: 'year' });
    const entity = {};
    const id = composeEntityId(strategy, 'item', entity);

    const now = new Date();
    const year = now.getFullYear().toString();
    expect(id).toMatch(new RegExp(`^item\\.${year}\\.[A-Za-z0-9]{8}$`));
  });
});
