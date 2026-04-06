import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';

export class EventBus<T = unknown> {
  private readonly subject = new Subject<T>();

  readonly all$: Observable<T> = this.subject.asObservable();

  emit(event: T): void {
    this.subject.next(event);
  }

  dispose(): void {
    this.subject.complete();
  }
}
