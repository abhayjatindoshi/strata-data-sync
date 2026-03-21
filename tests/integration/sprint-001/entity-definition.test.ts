import { describe, it, expect } from 'vitest';
import { defineEntity } from '../../../src/index.js';

type Todo = {
  title: string;
  done: boolean;
};

type Note = {
  content: string;
  tags: string[];
};

describe('Sprint 001 Integration: defineEntity', () => {
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
