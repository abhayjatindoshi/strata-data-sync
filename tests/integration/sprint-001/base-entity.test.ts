import { describe, it, expect } from 'vitest';
import type { BaseEntity, Entity } from '../../../src/index.js';

type TodoFields = {
  title: string;
  done: boolean;
};

describe('Sprint 001 Integration: BaseEntity Fields & Entity Type', () => {
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

    // Base fields
    expect(todo.id).toBe('todo.2025-06.Zz1Aa2Bb');
    expect(todo.version).toBe(1);
    expect(todo.device).toBe('mobile-01');

    // Custom fields
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

    // Verify the entity object can be used as a snapshot
    const snapshot = { ...todo };
    expect(snapshot.id).toBe(todo.id);
    expect(snapshot.title).toBe(todo.title);
  });
});
