import type { Observable } from 'rxjs';

export type ChangeSignal = {
  readonly notify: () => void;
  readonly observe$: Observable<void>;
  readonly dispose: () => void;
};
