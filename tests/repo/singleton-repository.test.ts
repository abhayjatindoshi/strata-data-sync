import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createStore } from '@strata/store';
import { createEventBus } from '@strata/reactive';
import { defineEntity } from '@strata/schema';
import { createSingletonRepository } from '@strata/repo';
import type { Hlc } from '@strata/hlc';

type Settings = { theme: string; language: string };

function makeHlcRef(): { current: Hlc } {
  return { current: { timestamp: 0, counter: 0, nodeId: 'test-device' } };
}

const SettingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });

describe('SingletonRepository', () => {
  describe('get', () => {
    it('returns undefined when no entity saved', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      expect(repo.get()).toBeUndefined();
    });

    it('returns saved entity', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      repo.save({ theme: 'dark', language: 'en' });
      const entity = repo.get();
      expect(entity).toBeDefined();
      expect(entity!.theme).toBe('dark');
      expect(entity!.language).toBe('en');
    });
  });

  describe('save', () => {
    it('stamps BaseEntity fields', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      repo.save({ theme: 'dark', language: 'en' });
      const entity = repo.get();
      expect(entity!.id).toBe('settings._.settings');
      expect(entity!.version).toBe(1);
      expect(entity!.createdAt).toBeInstanceOf(Date);
      expect(entity!.updatedAt).toBeInstanceOf(Date);
    });

    it('increments version on subsequent saves', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      repo.save({ theme: 'dark', language: 'en' });
      repo.save({ theme: 'light', language: 'en' });
      const entity = repo.get();
      expect(entity!.version).toBe(2);
      expect(entity!.theme).toBe('light');
    });

    it('uses deterministic ID (entityName._.entityName)', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      repo.save({ theme: 'dark', language: 'en' });
      const entity = repo.get();
      expect(entity!.id).toBe('settings._.settings');
    });
  });

  describe('delete', () => {
    it('returns false when nothing to delete', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      expect(repo.delete()).toBe(false);
    });

    it('returns true and removes entity', () => {
      const store = createStore();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), createEventBus());
      repo.save({ theme: 'dark', language: 'en' });
      expect(repo.delete()).toBe(true);
      expect(repo.get()).toBeUndefined();
    });
  });

  describe('observe', () => {
    it('emits current value on subscribe', async () => {
      const store = createStore();
      const bus = createEventBus();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), bus);
      repo.save({ theme: 'dark', language: 'en' });

      const value = await firstValueFrom(repo.observe());
      expect(value).toBeDefined();
      expect(value!.theme).toBe('dark');
    });

    it('emits undefined when no entity saved', async () => {
      const store = createStore();
      const bus = createEventBus();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), bus);

      const value = await firstValueFrom(repo.observe());
      expect(value).toBeUndefined();
    });

    it('emits updated value on save', async () => {
      const store = createStore();
      const bus = createEventBus();
      const repo = createSingletonRepository(SettingsDef, store, makeHlcRef(), bus);

      const values: unknown[] = [];
      const sub = repo.observe().subscribe(v => values.push(v));

      repo.save({ theme: 'dark', language: 'en' });
      repo.save({ theme: 'light', language: 'fr' });

      sub.unsubscribe();

      expect(values.length).toBeGreaterThanOrEqual(3);
      expect(values[0]).toBeUndefined();
      const last = values[values.length - 1] as Settings;
      expect(last.theme).toBe('light');
    });
  });
});
