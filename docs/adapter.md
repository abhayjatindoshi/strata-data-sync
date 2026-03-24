# Adapter Contract

## Interface

One interface for both local and cloud adapters:

```typescript
type BlobAdapter = {
  read(meta: Readonly<Record<string, unknown>> | undefined, key: string): Promise<Uint8Array | null>;
  write(meta: Readonly<Record<string, unknown>> | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(meta: Readonly<Record<string, unknown>> | undefined, key: string): Promise<boolean>;
  list(meta: Readonly<Record<string, unknown>> | undefined, prefix: string): Promise<string[]>;
};
```

4 methods. No generics. No query capabilities. Blob I/O only.

## `meta` Parameter

Every method receives `meta` as the first parameter:

- **`undefined`** — unscoped operation. Used for tenant list (`__tenants` blob) stored in the app's default space (e.g., Google Drive appDataFolder, S3 default bucket).
- **`Record<string, unknown>`** — tenant-scoped operation. Opaque to the framework. Adapter casts to its own type internally.

Examples:

```typescript
// Google Drive adapter casts:
const { folderId, space, driveId } = meta as GoogleDriveMeta;

// S3 adapter casts:
const { bucket, prefix, region } = meta as S3Meta;
```

## No Generics

The adapter interface has no generic type parameters. The framework doesn't know or care about the shape of `meta`. Adapter implementations cast internally. App code has zero angle brackets.

## Framework Responsibilities

The framework handles:
- **Serialization**: entities → JSON string → `Uint8Array` (via `TextEncoder`)
- **Deserialization**: `Uint8Array` → JSON string → entities (via `TextDecoder` + `JSON.parse` with reviver)
- **Type markers**: `Date` → `{ __t: 'D', v: isoString }` during serialization, reversed on deserialization
- **Transform pipeline**: after serialization, before adapter write (compression, encryption)

## Transform Pipeline

Per-adapter configurable transforms applied between serialization and adapter I/O:

```typescript
createStrata({
  localAdapter: {
    adapter: createIDBAdapter(),
    transforms: [encrypt(key)],
  },
  cloudAdapter: {
    adapter: createGoogleDriveAdapter(credentials),
    transforms: [gzip(), encrypt(key)],
  },
});
```

Write: `serialize(entities) → transform[0] → transform[1] → adapter.write(bytes)`
Read: `adapter.read() → transform[1]⁻¹ → transform[0]⁻¹ → deserialize(entities)`

Framework ships: `gzip()`, `encrypt(key)`. Apps can provide custom transforms.

## `MemoryBlobAdapter`

Framework ships a simple in-memory Map-backed adapter for testing:

```typescript
const adapter = createMemoryBlobAdapter();
// Stores blobs in Map<string, Uint8Array>
// read() returns stored bytes or null
// write() stores defensive copy
// delete() removes entry
// list() iterates keys by prefix
```

## Keys Used by Framework

| Key pattern | Purpose |
|---|---|
| `__tenants` | Tenant list blob (unscoped, `meta = undefined`) |
| `__strata` | Workspace marker blob (per-tenant, indicates strata data exists at this location) |
| `__index.{entityName}` | Partition index for an entity type |
| `{entityName}.{partitionKey}` | Partition blob containing entities |

## Implementing a Custom Adapter

Minimal implementation:

```typescript
function createMyAdapter(): BlobAdapter {
  return {
    async read(meta, key) {
      const location = resolveLocation(meta);
      return myStorage.get(location, key);
    },
    async write(meta, key, data) {
      const location = resolveLocation(meta);
      await myStorage.put(location, key, data);
    },
    async delete(meta, key) {
      const location = resolveLocation(meta);
      return myStorage.remove(location, key);
    },
    async list(meta, prefix) {
      const location = resolveLocation(meta);
      return myStorage.listKeys(location, prefix);
    },
  };
}
```
