import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { BaseTenant } from '../tenant/index.js';
import type { TenantContextValue } from './react-types.js';
import { useStrataContext } from './strata-context.js';

const TenantContext = createContext<TenantContextValue | null>(null);

export type TenantProviderProps = {
  readonly children: ReactNode;
};

export function TenantProvider({ children }: TenantProviderProps): React.JSX.Element {
  const strata = useStrataContext();
  const tenantManager = strata.tenants;

  const [activeTenant, setActiveTenant] = useState<Readonly<BaseTenant> | undefined>(undefined);
  const [tenants, setTenants] = useState<ReadonlyArray<Readonly<BaseTenant>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = tenantManager.activeTenant$.subscribe((t) => {
      setActiveTenant(t as Readonly<BaseTenant> | undefined);
    });
    return () => sub.unsubscribe();
  }, [tenantManager]);

  useEffect(() => {
    void tenantManager.list().then((list) => {
      setTenants(list as ReadonlyArray<Readonly<BaseTenant>>);
      setLoading(false);
    });
  }, [tenantManager]);

  const switchTenant = useCallback(async (tenantId: string) => {
    setLoading(true);
    await tenantManager.switch(tenantId);
    const list = await tenantManager.list();
    setTenants(list as ReadonlyArray<Readonly<BaseTenant>>);
    setLoading(false);
  }, [tenantManager]);

  const createTenant = useCallback(async (data: { readonly name: string }) => {
    const tenant = await tenantManager.create(data);
    const list = await tenantManager.list();
    setTenants(list as ReadonlyArray<Readonly<BaseTenant>>);
    return tenant as Readonly<BaseTenant>;
  }, [tenantManager]);

  const value: TenantContextValue = {
    activeTenant,
    tenants,
    switchTenant,
    createTenant,
    loading,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantContext(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenantContext must be used within a TenantProvider');
  }
  return ctx;
}
