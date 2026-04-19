/**
 * Base class for all data-sync errors emitted on `strata.observe('error')`.
 *
 * Subclassed in adapter packages (e.g. `strata-adapters`) to carry
 * provider-specific kinds (`auth-expired`, `quota-exceeded`, …). Core code
 * emits `StrataError` directly for sync, repo, and persistence failures.
 */
export type ErrorOperation = 'read' | 'write' | 'delete' | 'list' | 'sync' | 'resolve';

export class StrataError extends Error {
  readonly kind: string;
  readonly operation: ErrorOperation;
  readonly retryable: boolean;
  readonly originalError?: Error;

  constructor(
    message: string,
    options: {
      kind: string;
      operation: ErrorOperation;
      retryable?: boolean;
      originalError?: Error;
    },
  ) {
    super(message);
    this.name = 'StrataError';
    this.kind = options.kind;
    this.operation = options.operation;
    this.retryable = options.retryable ?? false;
    this.originalError = options.originalError;
  }
}
