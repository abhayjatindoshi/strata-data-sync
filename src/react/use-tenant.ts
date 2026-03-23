import { useState, useEffect } from 'react';
import type { Tenant } from '@strata/tenant';
import { useStrata } from './strata-provider.js';

export function useTenant(): Tenant | null {
  const strata = useStrata();
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    const sub = strata.tenants.activeTenant$.subscribe((t) => setTenant(t));
    return () => sub.unsubscribe();
  }, [strata]);

  return tenant;
}

export function useTenantList(): ReadonlyArray<Tenant> {
  const strata = useStrata();
  const [tenants, setTenants] = useState<ReadonlyArray<Tenant>>([]);

  useEffect(() => {
    let cancelled = false;
    strata.tenants.list().then((list) => {
      if (!cancelled) setTenants(list);
    });
    return () => { cancelled = true; };
  }, [strata]);

  return tenants;
}

export function useIsDirty(): boolean {
  const strata = useStrata();
  const [dirty, setDirty] = useState(strata.isDirty);

  useEffect(() => {
    const sub = strata.isDirty$.subscribe((d) => setDirty(d));
    return () => sub.unsubscribe();
  }, [strata]);

  return dirty;
}
