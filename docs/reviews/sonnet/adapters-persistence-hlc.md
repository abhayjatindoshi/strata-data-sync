# Review: src/adapter/, src/persistence/, src/hlc/

---

## src/adapter/bridge.ts

Clean implementation. `deserialize<PartitionBlob>(bytes)` will throw on malformed input but that is expected and propagates to the caller correctly. No issues.

---

## src/adapter/crypto.ts

### [Security – High] Static PBKDF2 salt (line 38–41)
`appId` is used as the PBKDF2 salt:
```ts
{ name: 'PBKDF2', salt: buf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }
```
`appId` is a fixed, application-wide constant. PBKDF2 salts must be **random and per-credential** to prevent cross-user dictionary/rainbow-table attacks. With this design, two users who share the same app and password will derive the **exact same key-encryption key**, negating the purpose of salting. A random 16-byte salt should be generated per tenant/credential and stored alongside the DEK.

### [Medium] `decrypt` does not validate minimum buffer length (lines 92–107)
If `data.length < 1 + IV_LENGTH (13)`, `data[0]` (version byte) reads as `undefined` (treated as `NaN`, then `NaN !== 1` throws the version error first which is acceptable), but `data.slice(1, 13)` returns a short buffer, and the subsequent `crypto.subtle.decrypt` call will fail with an opaque WebCrypto error rather than a clear `InvalidEncryptionKeyError`. A length guard upfront would produce a better error message.

### [Low] `exportDek` spread may stack-overflow for large buffers (line 58)
`btoa(String.fromCharCode(...new Uint8Array(raw)))` uses the spread operator on the raw key bytes. For a 32-byte AES-256 key this is trivially safe, but the same pattern is replicated in `local-storage.ts` for **arbitrary-size blobs** where it is a real bug (see that file).

---

## src/adapter/encryption.ts

### [High] Silent data stored unencrypted when DEK is null (lines 44–47)
```ts
if (!this.dek) return data;   // ← plaintext stored silently
return encryptData(data, this.dek);
```
If `setDek` was never called (e.g., a newly created tenant whose DEK path through `setup` was skipped, or after an error mid-setup), entity partition blobs are persisted in plaintext with no warning. A caller inspecting `isConfigured` only checks whether `markerKey !== null`, not whether `dek` is set. The library should either throw if the DEK is expected but absent, or document clearly that partition data is plaintext until `setDek` is called.

### [Medium] Same silent bypass on decode (lines 60–64)
When `!this.dek` and encrypted ciphertext arrives, the ciphertext is returned as-is, causing the deserializer to receive garbage bytes and throw an opaque error rather than `InvalidEncryptionKeyError`.

---

## src/adapter/gzip.ts

No issues. Streaming compression is implemented correctly; `streamToUint8Array` accumulates chunks and concatenates them efficiently.

---

## src/adapter/keys.ts

No issues.

---

## src/adapter/local-storage.ts

### [High] Stack overflow for large blobs via `btoa` spread (lines 7–9)
```ts
function toBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}
```
`String.fromCharCode` receives the entire `Uint8Array` as spread arguments. JavaScript engines have a maximum call-stack argument count (typically 65 536 in V8). Large partition blobs can exceed this limit, causing a `RangeError: Maximum call stack size exceeded` at runtime. Fix: iterate in chunks or use a `reduce`-based approach:
```ts
let str = '';
for (let i = 0; i < data.length; i++) str += String.fromCharCode(data[i]);
return btoa(str);
```

### [Low] O(n) full localStorage scan on every `list()` call (lines 52–60)
`localStorage.length` and `localStorage.key(i)` must iterate over **all** keys in localStorage, not just those belonging to this adapter. In a browser with many other libraries also using localStorage this degrades over time. There is no practical mitigation without changing the storage layout, but users should be warned.

### [Low] No guard for environments without `localStorage` (global usage)
`globalThis.localStorage` will throw in SSR/worker contexts. Consider wrapping access with an availability check or documenting the browser-only constraint prominently.

---

## src/adapter/memory-blob-adapter.ts

No issues. Uses `structuredClone` for proper value semantics.

---

## src/adapter/memory-storage.ts

No issues. Uses `slice()` correctly.

---

## src/adapter/transform.ts

No issues.

---

## src/adapter/types.ts

No issues.

---

## src/persistence/hash.ts

### [Low] `fnv1aAppend` duplicates `fnv1a` body
`fnv1a` and `fnv1aAppend` share identical loop bodies. The only difference is the initial value. `fnv1a` could be expressed as `fnv1aAppend(FNV_OFFSET, input)`. Minor DRY violation.

### [Low] `charCodeAt` hashes surrogate pairs, not code points
For strings containing characters outside the Basic Multilingual Plane (emoji, some CJK), `charCodeAt` returns UCS-2 surrogate pair code units. This is consistent within JavaScript but diverges from other language implementations of FNV-1a. Since `partitionHash` is used only for change-detection (not cross-language interop), this is low risk.

---

## src/persistence/partition-index.ts

### [Medium] Multiple unchecked runtime casts to `Record<string, unknown>` (lines 13–15, 27–28)
All access to the marker blob's internal structure uses `as Record<string, unknown>`. Corrupted or version-mismatch blobs will silently return empty indexes or crash at a later point. The code has no schema validation layer before casting.

---

## src/persistence/serialize.ts

### [Medium] Deserialization has no schema validation (lines 31–33)
```ts
export function deserialize<T>(bytes: Uint8Array): T {
  return JSON.parse(json, reviver) as T;
}
```
The result is cast directly to `T` with no runtime validation. Malformed or attacker-controlled storage data could produce objects with unexpected shapes that cause type-confusion errors deep in the call stack. For a library that reads from user-controlled or cloud storage, this is an OWASP A08 (Software and Data Integrity Failures) concern.

### [Low] `reviver` trusts `__t` marker in stored data
A blob containing `{ "__t": "D", "v": "..." }` at any nesting level will be coerced to a `Date`. If an entity field legitimately stores objects with these keys, they will be silently converted, corrupting data on round-trip.

---

## src/persistence/types.ts

### [Low] Overly permissive `PartitionBlob` index signature
`[entityName: string]: Record<string, unknown> | Record<string, Record<string, Hlc>> | number | undefined` forces every access to use `as` casts throughout the codebase. A discriminated union or tighter type would eliminate dozens of unsafe casts.

---

## src/hlc/hlc.ts

### [Medium] No clock-drift detection or capping
Standard HLC implementations (Kulkarni & Demirbas 2014) include a **wall-clock drift check**: if a received remote HLC timestamp is more than a configurable threshold ahead of `Date.now()`, the node should reject or warn. Without this guard, a single malicious or clock-misconfigured remote node can push `r.timestamp` arbitrarily far into the future. All subsequent `tick` calls will then use that inflated timestamp, permanently corrupting the chronological ordering.

```ts
// Missing: if (r.timestamp - now > MAX_DRIFT_MS) throw new HlcDriftError(...)
```

### [Low] Counter unbounded growth in rapid-event scenarios
The counter increments on every event when multiple events share the same millisecond. There is no upper bound check. Extremely high write throughput (thousands of operations/ms) could yield very large counter values, bloating the HLC string representation used in partition hashes.

---

## src/hlc/index.ts / types.ts

No issues.
