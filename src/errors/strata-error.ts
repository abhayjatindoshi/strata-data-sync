/**
 * Base class for all typed errors in the strata framework.
 *
 * Each module defines one subclass with its own `kind` union.
 * Use `error.kind` to discriminate, not `instanceof` per-kind.
 * Use native `error.cause` (ES2022) for error chaining.
 */
export class StrataError extends Error {
  readonly kind: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      readonly kind: string;
      readonly retryable?: boolean;
      readonly cause?: Error;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'StrataError';
    this.kind = options.kind;
    this.retryable = options.retryable ?? false;
  }
}
