# Review: adapter/, persistence/, hlc/

## src/adapter/types.ts
No issues found. Clean interface definitions with proper readonly annotations.

## src/adapter/bridge.ts
No issues found. Clean adapter bridge pattern with proper transform chaining.

## src/adapter/crypto.ts

### [crypto.ts:11] PBKDF2 iteration count below current recommendations (medium)
`PBKDF2_ITERATIONS = 100_000` — OWASP currently recommends 600,000+ iterations for SHA-256 PBKDF2 as of 2023. 100K is usable but below the recommended minimum.

### [crypto.ts:62] Stack overflow risk in exportDek with spread operator (low)
```ts
return btoa(String.fromCharCode(...new Uint8Array(raw)));
```
Spreading a Uint8Array into `String.fromCharCode()` can overflow the call stack for large arrays. For a 32-byte AES key this is safe, but this is a fragile pattern. `importDek` has the same pattern using `Uint8Array.from(atob(...))` which is fine.

### [crypto.ts:36] Salt derived solely from appId — no randomness (medium)
```ts
const salt = textEncoder.encode(appId);
```
The PBKDF2 salt is the `appId` string. All users of the same app derive the same key from the same password, making rainbow table attacks more efficient. Standard practice is to use a random salt stored alongside the ciphertext.

## src/adapter/encryption.ts

### [encryption.ts:48-50] Silent fallback to no encryption when DEK is missing (high)
```ts
if (!this.dek) return data;
return encryptData(data, this.dek);
```
In both `encode` and `decode`, if `this.dek` is null, data passes through unencrypted without any warning or error. This could result in plaintext data being written to storage if the encryption setup is incomplete — a silent security degradation.

### [encryption.ts:43] Tenant list is always unencrypted (low)
```ts
if (key === TENANTS_KEY) return data;
```
The tenant list (`__tenants`) is explicitly excluded from encryption. Tenant metadata (names, meta fields) may contain sensitive information. This appears intentional for pre-auth listing but should be documented.

## src/adapter/gzip.ts
No issues found. Clean compression/decompression using standard Streams API.

## src/adapter/keys.ts
No issues found.

## src/adapter/local-storage.ts

### [local-storage.ts:8] Stack overflow risk for large Uint8Array in toBase64 (medium)
```ts
function toBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}
```
Unlike `exportDek` which operates on 32 bytes, `toBase64` in LocalStorageAdapter operates on arbitrarily large partition blobs. Spreading a large Uint8Array (e.g., >100KB) will exceed the maximum call stack size. Should use a chunked approach or `Buffer` API.

### [local-storage.ts:34] No error handling for localStorage quota exceeded (medium)
`localStorage.setItem()` can throw when storage quota is exceeded. No try/catch or error propagation.

## src/adapter/memory-blob-adapter.ts
No issues found. Good use of `structuredClone` for defensive copying.

## src/adapter/memory-storage.ts
No issues found. Good use of `data.slice()` for defensive copying.

## src/adapter/transform.ts
No issues found. Correctly applies transforms in forward order for encode and reverse order for decode.

## src/adapter/index.ts
No issues found.

---

## src/persistence/types.ts

### [types.ts:14-18] PartitionBlob index signature creates type ambiguity (low)
The `[entityName: string]` index signature combined with the fixed `deleted` and `__v` fields means TypeScript cannot distinguish entity data from system fields at the type level. Any access to `blob[someKey]` returns the union type, requiring runtime checks.

## src/persistence/serialize.ts

### [serialize.ts:4-6] Limited custom type serialization (low)
Only `Date` objects are handled by the custom replacer/reviver. Other complex types (`Map`, `Set`, `RegExp`, `undefined` in arrays) will be silently lost during JSON serialization. This is fine if entities are constrained to JSON-safe types, but there's no enforcement of that constraint.

## src/persistence/hash.ts
No issues found. FNV-1a is appropriate for partition hash comparison. Deterministic key sorting is correct.

## src/persistence/partition-index.ts

### [partition-index.ts:21-39] Race condition in saveAllIndexes (medium)
`saveAllIndexes` reads the existing marker blob, modifies it, and writes it back. If two concurrent calls to `saveAllIndexes` occur (e.g., from parallel sync operations), one write can overwrite the other's changes (read-modify-write without locking).

### [partition-index.ts:29] Marker data defaults created on every save when existing is empty (low)
When `existing` blob exists but has no `marker` entry, a new default with `createdAt: new Date()` is created. This means the `createdAt` timestamp of the marker can change on subsequent saves.

## src/persistence/index.ts
No issues found.

---

## src/hlc/types.ts
No issues found.

## src/hlc/hlc.ts
No issues found. Correct HLC implementation with proper handling of clock skew, ties, and counter increment logic. `compareHlc` provides deterministic total ordering.

## src/hlc/index.ts
No issues found.
