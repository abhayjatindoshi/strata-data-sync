# Adapter Contract

## Two-Layer Architecture

The adapter layer has two interfaces, distinguished by a `kind` discriminator:

- **`StorageAdapter`** (`kind: 'storage'`) — raw byte I/O. This is what apps implement.
- **`BlobAdapter`** (`kind: 'blob'`) — structured `PartitionBlob` I/O. Used internally by the framework.

`AdapterBridge` connects them: it wraps a `StorageAdapter` into a `BlobAdapter`, handling serialization and optional encryption. When `localAdapter` in `StrataConfig` receives a `StorageAdapter`, the framework auto-wraps it via `AdapterBridge`.

## `StorageAdapter` — App-Facing Interface

```typescript
type StorageAdapter = {
  readonly kind: 'storage';
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};
```

4 methods. Raw bytes in, raw bytes out. No query capabilities.

## `BlobAdapter` — Framework-Internal Interface

```typescript
type BlobAdapter = {
  readonly kind: 'blob';
  read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null>;
  write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};
```

Operates on deserialized `PartitionBlob` objects. The in-memory `Store` also implements this interface.

## `tenant` Parameter

Every method receives `tenant` as the first parameter:

- **`undefined`** — unscoped operation. Used for tenant list (`__tenants` blob) stored in the app's default space (e.g., Google Drive appDataFolder, S3 default bucket).
- **`Tenant`** — tenant-scoped operation. The adapter reads `tenant.meta` to resolve the storage location.

Examples:

```typescript
// Google Drive adapter:
const { folderId, space, driveId } = tenant.meta as GoogleDriveMeta;

// S3 adapter:
const { bucket, prefix, region } = tenant.meta as S3Meta;
```

## `AdapterBridge`

Wraps a `StorageAdapter` into a `BlobAdapter` with a composable transform pipeline:

```typescript
const bridge = new AdapterBridge(storage, appId, {
  transforms: [encryptionTransform(encCtx)],  // optional
});
```

Responsibilities:
- **Serialization**: `PartitionBlob` → JSON → `Uint8Array` (via `serialize()`) on write
- **Deserialization**: `Uint8Array` → JSON → `PartitionBlob` (via `deserialize()`) on read
- **Transform pipeline**: after serialization, applies `BlobTransform` chain (encryption, compression, etc.)
- **Key namespacing**: prepends `appId/` to all keys so multiple Strata instances can share one storage backend

### Pipeline

```
Write: PartitionBlob → serialize → transform[0].encode → transform[1].encode → StorageAdapter.write(bytes)
Read:  StorageAdapter.read() → transform[1].decode → transform[0].decode → deserialize → PartitionBlob
```

### `BlobTransform`

```typescript
type BlobTransform = {
  encode(data: Uint8Array): Promise<Uint8Array>;
  decode(data: Uint8Array): Promise<Uint8Array>;
};
```

Transforms are composable. Multiple transforms are applied in order on write and reversed on read:

```typescript
const bridge = new AdapterBridge(storage, appId, {
  transforms: [compress(), encryptionTransform(encCtx)],
});
// Write: serialize → compress → encrypt → storage
// Read:  storage → decrypt → decompress → deserialize
```

## Framework Responsibilities

The framework handles:
- **Serialization**: entities → JSON string → `Uint8Array` (via `TextEncoder`)
- **Deserialization**: `Uint8Array` → JSON string → entities (via `TextDecoder` + `JSON.parse` with reviver)
- **Type markers**: `Date` → `{ __t: 'D', v: isoString }` during serialization, reversed on deserialization

## Encryption

Encryption is handled via a KEK/DEK envelope pattern using AES-256-GCM, exposed as a `BlobTransform`:

```typescript
// Initialize (derives keys, bootstraps salt + wrapped DEK on first call)
const encCtx = await initEncryption(storage, appId, password);

// Convert to a BlobTransform and use with AdapterBridge
const bridge = new AdapterBridge(storage, appId, {
  transforms: [encryptionTransform(encCtx)],
});

// Or use createStrataAsync which does both automatically:
const strata = await createStrataAsync({
  appId: 'my-app',
  localAdapter: myStorageAdapter,  // StorageAdapter
  encryption: { password },
  // ... other config
});
```

Additional encryption APIs on `Strata`:
- `strata.enableEncryption(password)` — encrypts all existing data
- `strata.disableEncryption(password)` — decrypts all data
- `strata.changePassword(oldPassword, newPassword)` — re-wraps the DEK

Key material stored in the `StorageAdapter` at `appId/__strata_salt` and `appId/__strata_dek`.

## `MemoryBlobAdapter`

Framework ships a simple in-memory Map-backed adapter for testing:

```typescript
const adapter = createMemoryBlobAdapter();
// Stores blobs in Map<string, PartitionBlob>
// read() returns stored blob or null
// write() stores defensive clone
// delete() removes entry
// list() iterates keys by prefix
```

## `MemoryStorageAdapter`

Framework ships a byte-level in-memory adapter for testing:

```typescript
const storage = new MemoryStorageAdapter();
// Stores raw bytes in Map<string, Uint8Array>
// read() returns stored bytes or null
// write() stores defensive copy
// delete() removes entry
// list() iterates keys by prefix
```

## Keys Used by Framework

| Key pattern | Purpose |
|---|---|
| `__tenants` | Tenant list blob (unscoped, `tenant = undefined`) |
| `__strata` | Workspace marker blob (per-tenant, contains partition indexes) |
| `{entityName}.{partitionKey}` | Partition blob containing entities |

## Implementing a Custom Adapter

Minimal `StorageAdapter` implementation:

```typescript
class MyStorageAdapter implements StorageAdapter {
  readonly kind = 'storage';

  async read(tenant, key) {
    const location = resolveLocation(tenant);
    return myStorage.get(location, key);
  }
  async write(tenant, key, data) {
    const location = resolveLocation(tenant);
    await myStorage.put(location, key, data);
  }
  async delete(tenant, key) {
    const location = resolveLocation(tenant);
    return myStorage.remove(location, key);
  }
  async list(tenant, prefix) {
    const location = resolveLocation(tenant);
    return myStorage.listKeys(location, prefix);
  }
}
```
