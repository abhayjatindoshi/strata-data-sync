import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import type { EntityEventBus } from './entity-event-bus';
import type { EntityEventListener } from './event-types';

export type CollectionObservable<T> = {
  readonly observable: BehaviorSubject<ReadonlyArray<Readonly<T>>>;
  readonly destroy: () => void;
};

export function observeCollection<T>(
  eventBus: EntityEventBus,
  entityName: string,
  getCurrentValues: () => ReadonlyArray<Readonly<T>>,
  partitionKey?: string,
): CollectionObservable<T> {
  const initial = getCurrentValues();
  const subject = new BehaviorSubject<ReadonlyArray<Readonly<T>>>(initial);

  const listener: EntityEventListener = (event) => {
    if (event.entityName !== entityName) return;
    if (partitionKey !== undefined && event.partitionKey !== partitionKey) return;

    subject.next(getCurrentValues());
  };

  eventBus.on(listener);

  const piped = new BehaviorSubject<ReadonlyArray<Readonly<T>>>(initial);
  const subscription = subject
    .pipe(distinctUntilChanged((a, b) => arraysEqual(a, b)))
    .subscribe((val) => piped.next(val));

  return {
    observable: piped,
    destroy(): void {
      eventBus.off(listener);
      subscription.unsubscribe();
      subject.complete();
      piped.complete();
    },
  };
}

function arraysEqual<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
