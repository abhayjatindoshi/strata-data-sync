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
const bridge = new AdapterBridge(storage, {
  transforms: [encryptionTransform],  // optional
});
```

Responsibilities:
- **Serialization**: `PartitionBlob` → JSON → `Uint8Array` (via `serialize()`) on write
- **Deserialization**: `Uint8Array` → JSON → `PartitionBlob` (via `deserialize()`) on read
- **Transform pipeline**: after serialization, applies `BlobTransform` chain (encryption, compression, etc.)

Key scoping (e.g., per-app or per-tenant namespacing) is the `StorageAdapter` implementation's responsibility, not the bridge's.

### Pipeline

```
Write: PartitionBlob → serialize → transform[0].encode → transform[1].encode → StorageAdapter.write(bytes)
Read:  StorageAdapter.read() → transform[1].decode → transform[0].decode → deserialize → PartitionBlob
```

### `BlobTransform`

```typescript
type BlobTransform = {
  encode(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array>;
  decode(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<Uint8Array>;
};
```

Transforms are composable. Multiple transforms are applied in order on write and reversed on read:

```typescript
const bridge = new AdapterBridge(storage, {
  transforms: [gzipTransform(), encryptionService.toTransform()],
});
// Write: serialize → gzip → encrypt → storage
// Read:  storage → decrypt → gunzip → deserialize
```

### `gzipTransform()`

Framework ships `gzipTransform()` using the Web Compression Streams API:

```typescript
import { gzipTransform } from 'strata-data-sync';

const transform = gzipTransform();
// transform.encode(tenant, key, data) — gzip compresses a Uint8Array
// transform.decode(tenant, key, data) — gzip decompresses a Uint8Array
```

## Framework Responsibilities

The framework handles:
- **Serialization**: entities → JSON string → `Uint8Array` (via `TextEncoder`)
- **Deserialization**: `Uint8Array` → JSON string → entities (via `TextDecoder` + `JSON.parse` with reviver)
- **Type markers**: `Date` → `{ __t: 'D', v: isoString }` during serialization, reversed on deserialization

## Encryption

Encryption is per-tenant, using a key hierarchy based on AES-256-GCM. Each encrypted tenant has its own DEK (Data Encryption Key), stored inside the encrypted `__strata` marker blob.

### Key Hierarchy

```
password + appId → PBKDF2 (100k iterations) → markerKey
                                                    │
                                    Encrypts/decrypts __strata blob
                                    __strata contains raw DEK (base64)
                                                    │
                                    DEK encrypts all data blobs
```

### Per-Tenant Encryption

Encryption is opt-in at tenant creation:

```typescript
// Encrypted tenant
await strata.tenants.create({
  name: 'Work',
  meta: {},
  encryption: { password: 'my-secret' },
});

// Unencrypted tenant
await strata.tenants.create({ name: 'Personal', meta: {} });
```

Loading an encrypted tenant requires the password:

```typescript
await strata.loadTenant(tenantId, { password: 'my-secret' });
```

Detection is automatic — `loadTenant` reads the raw `__strata` bytes. If the first byte is `{` (JSON), the tenant is unencrypted. Otherwise, it's encrypted and a password is required.

### Encrypted File Format

```
[version 1B] [IV 12B] [AES-GCM ciphertext]
```

All encrypted files (including `__strata`) use this format. The `__tenants` file is always plaintext.

### Low-Level Crypto Functions

| Function | Purpose |
|---|---|
| `deriveKey(password, appId)` | Derives an AES-256-GCM key via PBKDF2 |
| `generateDek()` | Generates a random AES-256-GCM Data Encryption Key |
| `exportDek(dek)` | Exports DEK to base64 string |
| `importDek(base64)` | Imports DEK from base64 string |
| `encrypt(data, key)` | Encrypts a `Uint8Array` with AES-256-GCM (prepends version + IV) |
| `decrypt(data, key)` | Decrypts a `Uint8Array` (reads version + IV from prefix) |

`InvalidEncryptionKeyError` is thrown when decryption fails due to a wrong password. This error class is defined in `strata-data-sync`. Concrete encryption implementations (e.g., `Pbkdf2EncryptionService`, `AesGcmEncryptionStrategy`) are provided by the `strata-adapters` package.

### `EncryptionTransformService`

Stateful transform service that handles per-tenant encryption:

```typescript
const service = new EncryptionTransformService();
await service.setup(password, appId);              // derives markerKey
service.setDek(dek);                              // set DEK after loading marker
service.toTransform();                            // returns BlobTransform
service.clear();                                  // clears all keys
```

Behavior by key:
- `__tenants` → always passthrough (plaintext)
- `__strata` → encrypt/decrypt with markerKey
- All other keys → encrypt/decrypt with DEK

### Usage

```typescript
const strata = new Strata({
  appId: 'my-app',
  localAdapter: myStorageAdapter,
  entities: [myEntity],
  deviceId: 'device-1',
});

// Create encrypted tenant
const tenant = await strata.tenants.create({
  name: 'Work',
  meta: {},
  encryption: { password: 's3cret' },
});

// Load with password
await strata.loadTenant(tenant.id, { password: 's3cret' });

// Change password (re-encrypts __strata only, DEK unchanged)
await strata.changePassword('s3cret', 'new-s3cret');
```

## `MemoryBlobAdapter`

Framework ships a simple in-memory Map-backed adapter for testing:

```typescript
const adapter = new MemoryBlobAdapter();
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
