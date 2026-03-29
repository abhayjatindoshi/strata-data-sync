# Encryption

## Overview

Strata supports per-tenant encryption. Each tenant can independently opt in to encryption at creation time. Encryption is immutable — once a tenant is created with or without encryption, it cannot be changed.

## Creating an Encrypted Tenant

```typescript
const tenant = await strata.tenants.create({
  name: 'Secure Workspace',
  meta: { container: 'secure-data' },
  encryption: { password: 'user-secret' },
});
```

This generates a random Data Encryption Key (DEK) and stores it inside the encrypted `__strata` marker blob. All data blobs for this tenant are encrypted with the DEK.

## Loading an Encrypted Tenant

```typescript
await strata.loadTenant(tenant.id, { password: 'user-secret' });
```

The password is required every time an encrypted tenant is loaded. Detection is automatic — the framework reads the raw `__strata` marker and determines if it's encrypted.

## Error Handling

```typescript
try {
  await strata.loadTenant(tenantId);
} catch (err) {
  if (err.message === 'Password required for encrypted tenant') {
    // Tenant is encrypted — prompt user for password
    const pw = await promptUser('Enter password:');
    await strata.loadTenant(tenantId, { password: pw });
  }
}
```

| Scenario | Error |
|---|---|
| Encrypted tenant, no password | `Error('Password required for encrypted tenant')` |
| Encrypted tenant, wrong password | `InvalidEncryptionKeyError` |
| Unencrypted tenant, no password | No error — loads normally |
| Unencrypted tenant, password provided | No error — password ignored |

Import `InvalidEncryptionKeyError` from `strata-data-sync` if you need to catch it specifically.

## Changing Passwords

```typescript
await strata.changePassword('old-password', 'new-password');
```

This re-encrypts only the `__strata` marker blob with the new password. The DEK (which encrypts all data blobs) is unchanged — no data re-encryption needed.

Requires an active encrypted tenant.

## Mixed Tenants

You can have encrypted and unencrypted tenants on the same Strata instance:

```typescript
const secureTenant = await strata.tenants.create({
  name: 'Secure',
  meta: {},
  encryption: { password: 'secret' },
});

const plainTenant = await strata.tenants.create({
  name: 'Public',
  meta: {},
});

// Load encrypted tenant
await strata.loadTenant(secureTenant.id, { password: 'secret' });
strata.repo(taskDef).save({ title: 'Classified', done: false });

// Switch to plain tenant — no password needed
await strata.loadTenant(plainTenant.id);
strata.repo(taskDef).save({ title: 'Public info', done: false });
```

## How It Works

### Key Hierarchy

```
password + appId → PBKDF2 (100k iterations) → markerKey (AES-256-GCM)
                                                    │
                                    Encrypts/decrypts __strata blob
                                    __strata contains raw DEK (base64)
                                                    │
                                    DEK encrypts all data blobs
```

### What's Encrypted

| File | Encrypted? | Key used |
|---|---|---|
| `__tenants` | No — always plaintext | — |
| `__strata` | Yes (encrypted tenants only) | markerKey |
| Data blobs (`task.global`, etc.) | Yes (encrypted tenants only) | DEK |

### Encrypted File Format

```
[version 1 byte] [IV 12 bytes] [AES-GCM ciphertext]
```

### Requirements

- `localAdapter` must be a `StorageAdapter` (not a `BlobAdapter`) for encryption to work. The `StorageAdapter` operates on raw bytes, which is where the encrypt/decrypt transform is applied.
- Encryption is handled by the `AdapterBridge` transform pipeline — transparent to the rest of the framework.
