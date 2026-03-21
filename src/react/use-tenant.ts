import type { TenantContextValue } from './react-types.js';
import { useTenantContext } from './tenant-context.js';

export function useTenant(): TenantContextValue {
  return useTenantContext();
}
