import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import type { DirtyTracker } from './types';

export function createDirtyTracker(): DirtyTracker {
  const subject = new BehaviorSubject<boolean>(false);

  return {
    get isDirty() {
      return subject.getValue();
    },

    isDirty$: subject.pipe(distinctUntilChanged()),

    markDirty() {
      if (!subject.getValue()) {
        subject.next(true);
      }
    },

    clearDirty() {
      if (subject.getValue()) {
        subject.next(false);
      }
    },
  };
}
