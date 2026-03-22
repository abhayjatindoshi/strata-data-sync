import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import type { EntityEventBus } from './entity-event-bus';
import type { EntityEventListener } from './event-types';
import { serialize } from '@strata/persistence';

export type EntityObservable<T> = {
  readonly observable: BehaviorSubject<Readonly<T> | undefined>;
  readonly destroy: () => void;
};

export function observeEntity<T>(
  eventBus: EntityEventBus,
  entityId: string,
  getCurrentValue: () => Readonly<T> | undefined,
): EntityObservable<T> {
  const initial = getCurrentValue();
  const subject = new BehaviorSubject<Readonly<T> | undefined>(initial);

  const listener: EntityEventListener = (event) => {
    if (event.entityId !== entityId) return;

    if (event.type === 'deleted') {
      subject.next(undefined);
    } else {
      subject.next(event.entity as Readonly<T> | undefined);
    }
  };

  eventBus.on(listener);

  const piped = new BehaviorSubject<Readonly<T> | undefined>(initial);
  const subscription = subject
    .pipe(distinctUntilChanged((a, b) => serialize(a) === serialize(b)))
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
