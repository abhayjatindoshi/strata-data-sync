import type { TenantContextValue } from './react-types';
import { useTenantContext } from './tenant-context';

export function useTenant(): TenantContextValue {
  return useTenantContext();
}
