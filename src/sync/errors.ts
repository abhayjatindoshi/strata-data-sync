import { StrataError } from '@/errors';

export type SyncErrorKind =
  | 'cloud-not-configured'
  | 'sync-failed';

export class SyncError extends StrataError {
  constructor(message: string, options: {
    readonly kind: SyncErrorKind;
    readonly retryable?: boolean;
    readonly cause?: Error;
  }) {
    super(message, { kind: options.kind, retryable: options.retryable, cause: options.cause });
    this.name = 'SyncError';
  }
}
