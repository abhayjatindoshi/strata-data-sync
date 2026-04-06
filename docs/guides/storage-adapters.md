# Storage Adapters

## Overview

A storage adapter is the bridge between Strata and your persistence layer. You implement the `StorageAdapter` interface — 4 methods, raw bytes in and out.

## `StorageAdapter` Interface

```typescript
type StorageAdapter = {
  readonly kind: 'storage';
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};
```

The framework handles serialization, encryption, and compression. Your adapter just stores and retrieves bytes.

## Tenant Scoping

Every method receives a `tenant` parameter:

- **`undefined`** — app-level data (tenant list). Store in a default location.
- **`Tenant`** — tenant-scoped data. Use `tenant.meta` to resolve the storage path.

The `meta` object is opaque — it's whatever your app puts in it at tenant creation. Common patterns:

```typescript
// Filesystem
const dir = tenant ? (tenant.meta.container as string) : 'default';
const fullPath = path.join(rootDir, dir, key);

// IndexedDB
const storeName = tenant ? `tenant-${tenant.id}` : 'app';

// S3
const prefix = tenant ? (tenant.meta.bucket as string) : 'app-data';
```

## Example: Filesystem Adapter

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageAdapter, Tenant } from 'strata-data-sync';

class FsStorageAdapter implements StorageAdapter {
  readonly kind = 'storage';
  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    const container = tenant?.meta?.container as string | undefined;
    if (container) return path.join(this.rootDir, container, key);
    return path.join(this.rootDir, key);
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.resolvePath(tenant, key));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolvePath(tenant, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    try {
      await fs.unlink(this.resolvePath(tenant, key));
      return true;
    } catch {
      return false;
    }
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const dir = path.dirname(this.resolvePath(tenant, prefix));
    try {
      const files = await fs.readdir(dir);
      const base = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
      return files.map(f => base + f).filter(f => f.startsWith(prefix));
    } catch {
      return [];
    }
  }
}
```

## Usage

```typescript
const strata = new Strata({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: new FsStorageAdapter('/data/strata'),
  deviceId: 'device-1',
});
```

When a `StorageAdapter` is passed as `localAdapter`, the framework wraps it with `AdapterBridge` automatically. The bridge handles:
- Serialization (`PartitionBlob` ↔ JSON ↔ `Uint8Array`)
- Transform pipeline (encryption, compression)

## `BlobAdapter` — Direct Interface

If your storage already handles serialization (e.g., a JSON-native database), implement `BlobAdapter` instead:

```typescript
type BlobAdapter = {
  readonly kind: 'blob';
  read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null>;
  write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  list(tenant: Tenant | undefined, prefix: string): Promise<string[]>;
};
```

No `AdapterBridge` wrapping — no encryption/compression transforms. Use this for cloud adapters or when encryption isn't needed.

## Key Naming

Keys the framework reads and writes:

| Key | Scope | Contents |
|---|---|---|
| `__tenants` | `tenant: undefined` | Tenant list |
| `__strata` | `tenant: Tenant` | Marker blob (indexes, metadata, DEK) |
| `task.global` | `tenant: Tenant` | Partition blob for entity `task`, partition `global` |
| `note.2026-03` | `tenant: Tenant` | Partition blob for entity `note`, partition `2026-03` |

## Tips

- **Return `null` from `read()` if the key doesn't exist** — don't throw
- **`list()` should return keys matching the prefix** — used for partition discovery
- **`delete()` returns `true` if something was deleted** — `false` if key didn't exist
- **Thread safety** — multiple reads/writes may happen concurrently. Ensure your adapter handles this (file locks, atomic writes, etc.)
