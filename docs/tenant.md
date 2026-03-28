# Tenant System

## Tenant Model

```typescript
type Tenant = {
  readonly id: string;                                    // short, URL-safe
  readonly name: string;                                  // shareable preference
  readonly icon?: string;                                 // shareable preference
  readonly color?: string;                                // shareable preference
  readonly meta: Readonly<Record<string, unknown>>;  // opaque adapter location
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

- **`id`** — short, URL-safe. Can be app-provided, derived from `meta` via `deriveTenantId()`, or framework-generated.
- **`meta`** — opaque bag the adapter needs to locate storage. Framework stores it, passes to adapter per-call, never interprets it.
- **Preferences** (name/icon/color) — shareable, stored in tenant data, synced to cloud.

## Tenant Identity

The tenant ID is NOT the cloud location. It's a short identifier for URLs and local key prefixing. The cloud location is in `meta`.

For sharing support, `deriveTenantId` produces deterministic IDs from cloud location:

```typescript
createStrata({
  deriveTenantId: (meta) => {
    const m = meta as GoogleDriveMeta;
    return m.folderId.substring(0, 8);  // short, deterministic
  },
  // ... other config
});
```

Two users sharing the same Drive folder → same derived tenant ID → sync connects them.

## TenantManager API

```typescript
type TenantManager = {
  list(): Promise<ReadonlyArray<Tenant>>;
  create(opts: { name: string; meta: Record<string, unknown>; id?: string }): Promise<Tenant>;
  setup(opts: { meta: Record<string, unknown>; name?: string }): Promise<Tenant>;
  load(tenantId: string): Promise<void>;
  delink(tenantId: string): Promise<void>;
  delete(tenantId: string): Promise<void>;
  activeTenant$: BehaviorSubject<Tenant | undefined>;
};
```

### `TenantManagerOptions`

```typescript
type TenantManagerOptions = {
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
  readonly entityTypes?: ReadonlyArray<string>;
};
```

- **`entityTypes`** — list of entity type names passed to `writeMarkerBlob()` on `create()`. Records which entity types exist in this workspace for `setup()` detection.
- **`deriveTenantId`** — optional function for deterministic tenant IDs from meta (enables sharing).

### Tenant List Caching

`TenantManager` caches the tenant list in memory after the first `list()` call. The cache is invalidated (replaced) on any mutation (`create`, `delink`, `delete`). Calling `list()` after a mutation returns the updated cached list without re-reading from the adapter.

| Method | What it does |
|---|---|
| `list()` | Returns all tenants from local storage (instant, offline) |
| `create()` | Creates a new tenant with meta. Generates or derives ID. Writes to local + cloud. |
| `setup()` | Opens an existing shared location. Reads marker blob to detect strata data. Merges prefs. |
| `load()` | Sets active tenant. Passes `meta` to all subsequent adapter calls. |
| `delink()` | Removes tenant from local list. Does NOT delete cloud data. |
| `delete()` | Removes tenant from list AND destroys all data at the meta location. |

## Tenant List Storage

- **Not an entity** — TenantManager owns storage directly via `BlobAdapter` I/O. No repo dependency (avoids circular dependency — repo requires a loaded tenant).
- **Stored as** `__tenants` blob with `meta = undefined` (app space).
- **Local primary** — write to local adapter instantly. Cloud sync is available via `pushTenantList`/`pullTenantList` but must be invoked manually by the app.
- **Multi-device merge** — merge by tenant ID with `updatedAt` comparison — newer wins for conflicts. Tenant list is append-mostly. Duplicates resolved by matching tenant ID.

## Tenant Lifecycle

### Who Does What

| Action | Auth Framework | App | Strata | Adapter |
|---|---|---|---|---|
| Login | **owns** | triggers | — | — |
| Create cloud folder | assists | **owns** | — | — |
| List tenants | — | calls strata | **owns** (reads blob) | reads from app space |
| Pick tenant | — | **owns** (UI) | — | — |
| Load tenant | — | calls strata | **owns** (sets active) | — |
| Create tenant record | — | provides meta | **owns** (stores in list) | writes blob |
| Setup shared tenant | — | provides meta | **owns** (detects existing) | reads marker |
| Delink tenant | — | calls strata | **owns** (removes from list) | writes blob |
| Delete tenant data | — | confirms | **owns** (orchestrates) | deletes blobs |

### Sharing Flow

```
User A creates folder 'abc123' in Google Drive
  → App calls strata.tenants.create({ name: 'Project X', meta: { folderId: 'abc123', space: 'drive' } })
  → Framework derives ID, writes marker blob at meta location
  → Tenant created locally + synced to cloud

User A shares folder with User B
  → User B picks shared folder
  → App calls strata.tenants.setup({ meta: { folderId: 'abc123', space: 'sharedWithMe' } })
  → Framework reads marker blob → detects existing strata workspace
  → Reads tenant prefs (name/icon) from that location
  → Adds to local tenant list with derived ID (same as User A's)
  → Same tenant ID → sync connects both users
```

## Marker Blob

`__strata` blob stored at each tenant's meta location. Stored as a `PartitionBlob` with the marker data nested under `__system.marker`:

```json
{
  "__system": {
    "marker": {
      "version": 1,
      "createdAt": "2026-03-22T10:30:00.000Z",
      "entityTypes": ["transaction", "account"],
      "indexes": {}
    }
  },
  "deleted": {}
}
```

The `indexes` field is initialized as an empty object and populated as partitions are synced.

Used by `setup()` to detect whether a cloud location already has strata data.

## Tenant Preferences Blob

`__tenant_prefs` blob stored at each tenant's meta location. Contains shareable preferences used by `setup()` to import the tenant's display name and appearance from a shared location.

```typescript
type TenantPrefs = {
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
};
```

Stored as a `PartitionBlob` with the prefs nested under `__prefs.prefs`:

```json
{
  "__prefs": { "prefs": { "name": "Project X", "icon": "📁", "color": "#3b82f6" } },
  "deleted": {}
}
```

When `setup()` opens a shared location, it reads `__tenant_prefs` to populate the tenant's name, icon, and color in the local tenant list.

### Updating Tenant Preferences

```typescript
import { saveTenantPrefs, loadTenantPrefs } from 'strata-data-sync';

// Save preferences to the tenant's meta location
await saveTenantPrefs(adapter, tenant, { name: 'New Name', icon: '📁', color: '#3b82f6' });

// Load preferences from the tenant's meta location
const prefs = await loadTenantPrefs(adapter, tenant);
```

### Tenant List Sync Functions

For multi-device tenant list synchronization:

| Function | Purpose |
|---|---|
| `mergeTenantLists(local, remote)` | Merges two tenant lists by ID, newer `updatedAt` wins conflicts |
| `pushTenantList(adapter, tenant)` | Writes the local tenant list to the cloud adapter |
| `pullTenantList(adapter, tenant)` | Reads the tenant list from the cloud adapter |

These functions are exported but **not called automatically** by `TenantManager`. Apps must invoke them manually for cloud tenant list synchronization.

### Marker Blob Validation

```typescript
import { validateMarkerBlob } from 'strata-data-sync';

// Returns true if the marker blob version is compatible
const isValid = validateMarkerBlob(markerData);
```

Used internally by `setup()` to verify version compatibility before importing a shared workspace.
