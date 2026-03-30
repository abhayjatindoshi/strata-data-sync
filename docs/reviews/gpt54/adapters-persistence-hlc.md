# Review: adapter, persistence, hlc

### src/adapter/bridge.ts
No issues found.

### src/adapter/crypto.ts
- Security: `deriveKey()` derives the marker key with a salt that is only the global `appId`, so every tenant using the same password under the same application gets the same PBKDF2 output. That weakens resistance to cross-tenant offline guessing and makes password reuse correlate ciphertexts across tenants. A per-tenant random salt persisted in the marker blob would be safer.

### src/adapter/types.ts
No issues found.

### src/adapter/transform.ts
No issues found.

### src/adapter/memory-storage.ts
No issues found.

### src/adapter/memory-blob-adapter.ts
No issues found.

### src/adapter/local-storage.ts
- Correctness/performance: `toBase64()` uses `String.fromCharCode(...data)`, which spreads the full byte array into a single JS call. That will throw for sufficiently large payloads and makes the adapter fail abruptly on larger partitions even before `localStorage` quota is reached.

### src/adapter/keys.ts
No issues found.

### src/adapter/index.ts
No issues found.

### src/adapter/gzip.ts
No issues found.

### src/adapter/encryption.ts
- Correctness/security: the transform silently passes non-marker payloads through unchanged whenever `dek` is unset. If an encrypted tenant is ever used before the DEK is rehydrated, writes succeed in plaintext instead of failing closed, which can leave a tenant with mixed encrypted and unencrypted partitions.

### src/persistence/types.ts
No issues found.

### src/persistence/serialize.ts
- Data integrity: the serializer reserves the generic object shape `{ __t: 'D', v: string }` for `Date` revival with no namespacing or escaping. Any user entity that legitimately stores that shape will deserialize as a `Date`, which means arbitrary application data can be silently rewritten on round-trip.

### src/persistence/partition-index.ts
No issues found.

### src/persistence/index.ts
No issues found.

### src/persistence/hash.ts
- Data integrity: partition divergence is reduced to a 32-bit FNV-1a hash. Because sync planning trusts that hash as a primary equality signal, a collision can cause a changed partition to be treated as unchanged and skip reconciliation, which is effectively silent lost-update risk.

### src/hlc/hlc.ts
No issues found.

### src/hlc/index.ts
No issues found.

### src/hlc/types.ts
No issues found.
