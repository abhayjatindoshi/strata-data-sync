import { describe, it, expect } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import type { BaseEntity } from '@strata/entity';
import { createEntityStore } from '@strata/store';
import { createChangeSignal } from '@strata/reactive';
import { defineEntity } from '@strata/schema';
import { singleton } from '@strata/key-strategy';
import { createSingletonRepository } from '@strata/repository/singleton-repository.js';

type Settings = BaseEntity & {
  readonly theme: string;
};

function makeSettings(theme: string, version = 1): Settings {
  return {
    id: 'settings',
    createdAt: new Date(),
    updatedAt: new Date(),
    version,
    device: 'test',
    hlc: { timestamp: Date.now(), counter: 0, nodeId: 'n1' },
    theme,
  };
}

describe('createSingletonRepository', () => {
  function setup() {
    const store = createEntityStore();
    const signal = createChangeSignal();
    const def = defineEntity<Settings>('settings', { keyStrategy: singleton });
    const repo = createSingletonRepository(def, store, signal);
    return { store, signal, repo };
  }

  it('returns undefined when empty', () => {
    const { repo } = setup();
    expect(repo.get()).toBeUndefined();
  });

  it('saves and retrieves entity', () => {
    const { repo } = setup();
    const settings = makeSettings('dark');
    repo.save(settings);
    expect(repo.get()).toEqual(settings);
  });

  it('save replaces existing entity', () => {
    const { repo } = setup();
    repo.save(makeSettings('dark'));
    const updated = makeSettings('light', 2);
    repo.save(updated);
    expect(repo.get()?.theme).toBe('light');
  });

  it('delete removes entity', () => {
    const { repo } = setup();
    repo.save(makeSettings('dark'));
    repo.delete();
    expect(repo.get()).toBeUndefined();
  });

  it('save notifies signal', () => {
    const { repo, signal } = setup();
    let notified = false;
    signal.observe$.subscribe(() => { notified = true; });
    repo.save(makeSettings('dark'));
    expect(notified).toBe(true);
  });

  it('observe emits current and updates', async () => {
    const { repo } = setup();
    repo.save(makeSettings('dark'));
    const value = await firstValueFrom(repo.observe());
    expect(value?.theme).toBe('dark');
  });

  it('observe emits on change', async () => {
    const { repo } = setup();
    const promise = firstValueFrom(
      repo.observe().pipe(take(2), toArray()),
    );
    repo.save(makeSettings('dark'));
    const [initial, afterSave] = await promise;
    expect(initial).toBeUndefined();
    expect(afterSave?.theme).toBe('dark');
  });
});
