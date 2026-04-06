import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

export class ReactiveFlag {
  private readonly subject: BehaviorSubject<boolean>;
  readonly value$;

  constructor(initial = false) {
    this.subject = new BehaviorSubject<boolean>(initial);
    this.value$ = this.subject.pipe(distinctUntilChanged());
  }

  get value(): boolean {
    return this.subject.getValue();
  }

  set(): void {
    if (!this.subject.getValue()) {
      this.subject.next(true);
    }
  }

  clear(): void {
    if (this.subject.getValue()) {
      this.subject.next(false);
    }
  }
}
