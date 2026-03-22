import { describe, it, expect } from 'vitest';
import type { BaseEntity, Entity } from '@strata/entity';
import {
  generateId,
  composeEntityId,
  parseEntityId,
  getEntityKey,
  buildEntityKey,
  buildEntityId,
} from '@strata/entity';
import { defineEntity } from '@strata/schema';
import { dateKeyStrategy } from '@strata/key-strategy';

// ── BaseEntity Fields & Entity Type ─────────────────────────────────
type TodoFields = {
  title: string;
  done: boolean;
};

describe('BaseEntity Fields & Entity Type', () => {
  it('BaseEntity has the required fields', () => {
    const base: BaseEntity = {
      id: 'todo.2025-06.abc12345',
      createdAt: new Date('2025-06-01T00:00:00Z'),
      updatedAt: new Date('2025-06-01T00:00:00Z'),
      version: 1,
      device: 'device-001',
    };

    expect(base.id).toBe('todo.2025-06.abc12345');
    expect(base.createdAt).toBeInstanceOf(Date);
    expect(base.updatedAt).toBeInstanceOf(Date);
    expect(base.version).toBe(1);
    expect(base.device).toBe('device-001');
  });

  it('Entity<T> merges BaseEntity fields with custom fields', () => {
    const todo: Entity<TodoFields> = {
      id: 'todo.2025-06.Zz1Aa2Bb',
      createdAt: new Date('2025-06-15T10:00:00Z'),
      updatedAt: new Date('2025-06-15T10:00:00Z'),
      version: 1,
      device: 'mobile-01',
      title: 'Buy groceries',
      done: false,
    };

    expect(todo.id).toBe('todo.2025-06.Zz1Aa2Bb');
    expect(todo.version).toBe(1);
    expect(todo.device).toBe('mobile-01');
    expect(todo.title).toBe('Buy groceries');
    expect(todo.done).toBe(false);
  });

  it('Entity<T> enforces readonly at type level (runtime snapshot check)', () => {
    const todo: Entity<TodoFields> = {
      id: 'todo.2025-06.XxYy1234',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'desktop-01',
      title: 'Read book',
      done: false,
    };

    const snapshot = { ...todo };
    expect(snapshot.id).toBe(todo.id);
    expect(snapshot.title).toBe(todo.title);
  });
});

// ── defineEntity ────────────────────────────────────────────────────
type Todo = {
  title: string;
  done: boolean;
};

type Note = {
  content: string;
  tags: string[];
};

describe('defineEntity', () => {
  it('creates an entity definition with the given name', () => {
    const todoDef = defineEntity<Todo>('todo');
    expect(todoDef.name).toBe('todo');
  });

  it('creates distinct definitions for different entity types', () => {
    const todoDef = defineEntity<Todo>('todo');
    const noteDef = defineEntity<Note>('note');
    expect(todoDef.name).not.toBe(noteDef.name);
  });

  it('returns an object with only the name property at runtime', () => {
    const todoDef = defineEntity<Todo>('todo');
    const keys = Object.keys(todoDef);
    expect(keys).toEqual(['name']);
  });

  it('preserves the exact name string provided', () => {
    const def = defineEntity<Todo>('my-complex_entityName');
    expect(def.name).toBe('my-complex_entityName');
  });
});

// ── Entity Key Parsing & Composition ────────────────────────────────
describe('Entity Key Parsing & Composition', () => {
  describe('buildEntityId + parseEntityId round-trip', () => {
    it('round-trips a simple entity ID', () => {
      const id = buildEntityId('todo', '2025-06', 'abc123XY');
      const parts = parseEntityId(id);
      expect(parts).toEqual({
        entityName: 'todo',
        partitionKey: '2025-06',
        uniqueId: 'abc123XY',
      });
    });

    it('round-trips an ID with year-only partition key', () => {
      const id = buildEntityId('report', '2024', 'Zz9aQwEr');
      const parts = parseEntityId(id);
      expect(parts.entityName).toBe('report');
      expect(parts.partitionKey).toBe('2024');
      expect(parts.uniqueId).toBe('Zz9aQwEr');
    });

    it('round-trips an ID with day partition key', () => {
      const id = buildEntityId('log', '2025-03-21', 'uniqueXX');
      const parts = parseEntityId(id);
      expect(parts.entityName).toBe('log');
      expect(parts.partitionKey).toBe('2025-03-21');
      expect(parts.uniqueId).toBe('uniqueXX');
    });
  });

  describe('getEntityKey', () => {
    it('extracts entity key (name + partition) from a full ID', () => {
      const id = buildEntityId('invoice', '2025-06', 'abc12345');
      const key = getEntityKey(id);
      expect(key).toBe('invoice.2025-06');
    });

    it('matches buildEntityKey output', () => {
      const entityName = 'task';
      const partitionKey = '2025-03';
      const uniqueId = 'Xy7pQr1z';

      const id = buildEntityId(entityName, partitionKey, uniqueId);
      const extractedKey = getEntityKey(id);
      const builtKey = buildEntityKey(entityName, partitionKey);
      expect(extractedKey).toBe(builtKey);
    });
  });

  describe('parseEntityId error handling', () => {
    it('throws on empty string', () => {
      expect(() => parseEntityId('')).toThrow('Invalid entity ID format');
    });

    it('throws on single-segment string', () => {
      expect(() => parseEntityId('todo')).toThrow('Invalid entity ID format');
    });

    it('throws on two-segment string (missing uniqueId)', () => {
      expect(() => parseEntityId('todo.2025')).toThrow('Invalid entity ID format');
    });
  });

  describe('composeEntityId + parseEntityId end-to-end', () => {
    it('composes an ID that can be parsed back correctly', () => {
      const strategy = dateKeyStrategy({ period: 'month' });
      const date = new Date('2025-08-15T12:00:00Z');
      const entity = { createdAt: date };

      const id = composeEntityId(strategy, 'task', entity);
      const parts = parseEntityId(id);

      expect(parts.entityName).toBe('task');
      expect(parts.partitionKey).toBe('2025-08');
      expect(parts.uniqueId).toHaveLength(8);
    });

    it('entity key from composed ID matches buildEntityKey', () => {
      const strategy = dateKeyStrategy({ period: 'day' });
      const date = new Date('2025-01-10T00:00:00Z');
      const entity = { createdAt: date };

      const id = composeEntityId(strategy, 'event', entity);
      const key = getEntityKey(id);
      expect(key).toBe(buildEntityKey('event', '2025-01-10'));
    });
  });
});

// ── ID Generation with DateKeyStrategy ──────────────────────────────
describe('ID Generation with DateKeyStrategy', () => {
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

// ── Full Consumer Workflow ──────────────────────────────────────────
type Invoice = {
  amount: number;
  currency: string;
  paid: boolean;
};

describe('Full Consumer Workflow', () => {
  it('defines an entity, generates an ID, and round-trips the key', () => {
    const invoiceDef = defineEntity<Invoice>('invoice');
    expect(invoiceDef.name).toBe('invoice');

    const strategy = dateKeyStrategy({ period: 'month' });

    const now = new Date('2025-09-15T14:30:00Z');
    const invoiceData = {
      amount: 99.99,
      currency: 'USD',
      paid: false,
      createdAt: now,
    };

    const id = composeEntityId(strategy, invoiceDef.name, invoiceData);

    const parts = parseEntityId(id);
    expect(parts.entityName).toBe('invoice');
    expect(parts.partitionKey).toBe('2025-09');
    expect(parts.uniqueId).toHaveLength(8);

    const key = getEntityKey(id);
    expect(key).toBe(buildEntityKey('invoice', '2025-09'));

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
    const strategy = dateKeyStrategy({ period: 'day' });
    const date = new Date(2025, 5, 15, 12, 0, 0);
    const id = composeEntityId(strategy, 'event', { createdAt: date });

    const parts = parseEntityId(id);
    expect(parts.entityName).toBe('event');
    expect(parts.partitionKey).toBe('2025-06-15');
    expect(parts.uniqueId).toBeTruthy();

    const rebuilt = `${parts.entityName}.${parts.partitionKey}.${parts.uniqueId}`;
    expect(rebuilt).toBe(id);
  });
});
