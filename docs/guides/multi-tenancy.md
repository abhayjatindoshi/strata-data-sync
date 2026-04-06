# Multi-Tenancy

## Overview

All data in Strata is scoped to a tenant. A tenant represents a workspace, project, or shared folder. You must create and load a tenant before reading or writing data.

## Creating Tenants

```typescript
const tenant = await strata.tenants.create({
  name: 'Work Project',
  meta: { container: 'work-folder-id' },
});
```

- `name` — display name
- `meta` — opaque object the adapter uses to locate storage (folder ID, bucket name, etc.)
- `id` — optional, auto-generated if not provided

The `meta` object is stored with the tenant and passed to every adapter call. Your `StorageAdapter` reads `tenant.meta` to resolve the storage path.

## Loading Tenants

```typescript
await strata.loadTenant(tenant.id);
```

Loading a tenant:
1. Sets it as the active tenant
2. Syncs data from cloud (if cloud adapter configured)
3. Hydrates entities into memory
4. Starts background sync scheduler

Only one tenant can be active at a time. Loading a new tenant unloads the previous one (flushing pending data first).

## Listing Tenants

```typescript
const tenants = await strata.tenants.list();
for (const t of tenants) {
  console.log(`${t.name} (${t.id})`);
}
```

The tenant list is cached in memory after the first call. Mutations (`create`, `delink`, `delete`) update the cache automatically.

## Switching Tenants

```typescript
await strata.loadTenant(workTenant.id);
// ... work with work data ...

await strata.loadTenant(personalTenant.id);
// previous tenant's data flushed, new tenant loaded
```

## Sharing Tenants

When two users share a cloud folder, they can connect to the same tenant using `setup()`:

```typescript
// User A creates a tenant pointing to a shared folder
const tenant = await strata.tenants.create({
  name: 'Shared Project',
  meta: { folderId: 'abc123', space: 'drive' },
});

// User B joins by pointing to the same folder
const sharedTenant = await strata.tenants.setup({
  meta: { folderId: 'abc123', space: 'sharedWithMe' },
});
```

`setup()` reads the `__strata` marker blob at the given location to detect an existing workspace, then adds it to the local tenant list.

### Deterministic Tenant IDs

For sharing to work, both users need the same tenant ID. Use `deriveTenantId`:

```typescript
const strata = new Strata({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: storage,
  deviceId: 'device-1',
  deriveTenantId: (meta) => {
    return (meta.folderId as string).substring(0, 8);
  },
});
```

Both users sharing the same folder → same derived ID → sync connects them.

## Tenant Preferences

Shareable preferences (name, icon, color) stored at the tenant's location:

```typescript
import { saveTenantPrefs, loadTenantPrefs } from 'strata-data-sync';

await saveTenantPrefs(adapter, tenant, {
  name: 'Project X',
  icon: '📁',
  color: '#3b82f6',
});

const prefs = await loadTenantPrefs(adapter, tenant);
```

When User B calls `setup()`, preferences are imported from the shared location.

## Removing Tenants

```typescript
// Remove from local list only (cloud data preserved)
await strata.tenants.delink(tenantId);

// Remove from list AND delete all data at the location
await strata.tenants.delete(tenantId);
```

## Tenant List Sync

The tenant list is stored locally. To sync it across devices:

```typescript
import { pushTenantList, pullTenantList } from 'strata-data-sync';

// Push local list to cloud
await pushTenantList(localAdapter, cloudAdapter);

// Pull cloud list to local (merges by ID, newer updatedAt wins)
await pullTenantList(localAdapter, cloudAdapter);
```

These are manual calls — the framework does not auto-sync the tenant list.
