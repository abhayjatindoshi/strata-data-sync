import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import type { DirtyTracker as DirtyTrackerType } from './types';

export class DirtyTracker {
  private readonly subject = new BehaviorSubject<boolean>(false);
  readonly isDirty$ = this.subject.pipe(distinctUntilChanged());

  get isDirty(): boolean {
    return this.subject.getValue();
  }

  markDirty(): void {
    if (!this.subject.getValue()) {
      this.subject.next(true);
    }
  }

  clearDirty(): void {
    if (this.subject.getValue()) {
      this.subject.next(false);
    }
  }
}
