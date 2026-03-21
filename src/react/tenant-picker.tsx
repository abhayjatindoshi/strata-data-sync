import { useCallback, type ChangeEvent } from 'react';
import { useTenant } from './use-tenant.js';

export function TenantPicker(): React.JSX.Element {
  const { activeTenant, tenants, switchTenant, loading } = useTenant();

  const handleChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const tenantId = e.target.value;
    if (tenantId) {
      void switchTenant(tenantId);
    }
  }, [switchTenant]);

  if (loading) {
    return <div data-testid="tenant-picker-loading">Loading tenants…</div>;
  }

  return (
    <select
      data-testid="tenant-picker"
      value={activeTenant?.id ?? ''}
      onChange={handleChange}
      aria-label="Select tenant"
    >
      <option value="" disabled>Select a tenant</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
