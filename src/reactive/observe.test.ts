import { describe, it, expect } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { createChangeSignal } from './change-signal.js';
import { observe, observeQuery } from './observe.js';
import { entityEquals, entityArrayEquals } from './change-detection.js';

describe('observe', () => {
  it('should emit initial value immediately', async () => {
    const signal = createChangeSignal();
    let counter = 0;
    const obs$ = observe(signal, () => ++counter);
    const value = await firstValueFrom(obs$);
    expect(value).toBe(1);
  });

  it('should emit new value on notify', async () => {
    const signal = createChangeSignal();
    let counter = 0;
    const obs$ = observe(signal, () => ++counter);
    const valuesPromise = firstValueFrom(obs$.pipe(take(2), toArray()));
    signal.notify();
    const values = await valuesPromise;
    expect(values).toEqual([1, 2]);
  });

  it('should skip unchanged values with compareFn', () => {
    const signal = createChangeSignal();
    const entity = { id: 'e1', version: 1 };
    const values: Array<{ id: string; version: number }> = [];
    const obs$ = observe(
      signal,
      () => ({ ...entity }),
      entityEquals,
    );
    obs$.subscribe(v => values.push(v));
    signal.notify();
    signal.notify();
    expect(values).toHaveLength(1);
  });

  it('should emit when entity version changes', () => {
    const signal = createChangeSignal();
    let version = 1;
    const values: Array<{ id: string; version: number }> = [];
    const obs$ = observe(
      signal,
      () => ({ id: 'e1', version }),
      entityEquals,
    );
    obs$.subscribe(v => values.push(v));
    version = 2;
    signal.notify();
    expect(values).toHaveLength(2);
  });
});

describe('observeQuery', () => {
  it('should emit initial query result', async () => {
    const signal = createChangeSignal();
    const items = [{ id: 'e1', version: 1 }];
    const obs$ = observeQuery(signal, () => [...items], entityArrayEquals);
    const value = await firstValueFrom(obs$);
    expect(value).toEqual([{ id: 'e1', version: 1 }]);
  });

  it('should skip unchanged query results', () => {
    const signal = createChangeSignal();
    const items = [{ id: 'e1', version: 1 }];
    const results: Array<ReadonlyArray<{ id: string; version: number }>> = [];
    const obs$ = observeQuery(signal, () => [...items], entityArrayEquals);
    obs$.subscribe(v => results.push(v));
    signal.notify();
    expect(results).toHaveLength(1);
  });
});
