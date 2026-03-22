import {
  map,
  startWith,
  distinctUntilChanged,
  type Observable,
} from 'rxjs';
import type { ChangeSignal } from './types.js';

export function observe<T>(
  signal: ChangeSignal,
  getFn: () => T,
  compareFn?: (a: T, b: T) => boolean,
): Observable<T> {
  return signal.observe$.pipe(
    startWith(undefined),
    map(() => getFn()),
    distinctUntilChanged(compareFn),
  );
}

export function observeQuery<T>(
  signal: ChangeSignal,
  queryFn: () => T,
  compareFn?: (a: T, b: T) => boolean,
): Observable<T> {
  return signal.observe$.pipe(
    startWith(undefined),
    map(() => queryFn()),
    distinctUntilChanged(compareFn),
  );
}
