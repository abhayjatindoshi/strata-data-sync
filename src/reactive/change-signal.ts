import { Subject } from 'rxjs';
import type { ChangeSignal } from './types.js';

export function createChangeSignal(): ChangeSignal {
  const subject = new Subject<void>();
  return {
    notify: () => subject.next(),
    observe$: subject.asObservable(),
    dispose: () => subject.complete(),
  };
}
