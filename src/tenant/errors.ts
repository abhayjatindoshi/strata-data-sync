import { StrataError } from '@/errors';

export type TenantErrorKind =
  | 'tenant-not-found'
  | 'credential-required'
  | 'workspace-not-found'
  | 'workspace-incompatible'
  | 'no-tenant-loaded'
  | 'not-encrypted'
  | 'cloud-not-configured';

export class TenantError extends StrataError {
  constructor(message: string, options: {
    readonly kind: TenantErrorKind;
    readonly cause?: Error;
  }) {
    super(message, { kind: options.kind, retryable: false, cause: options.cause });
    this.name = 'TenantError';
  }
}
