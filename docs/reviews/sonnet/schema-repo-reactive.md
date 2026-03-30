# Review: src/schema/, src/repo/, src/reactive/

---

## src/schema/define-entity.ts

### [Low] `deriveId` validation only rejects dots, not other reserved characters (lines 31–35)
```ts
function wrapDeriveId<T>(fn: (entity: T) => string): (entity: T) => string {
  return (entity: T) => {
    const id = fn(entity);
    if (id.includes('.')) {
      throw new Error('deriveId output must not contain dots');
    }
    return id;
  };
}
```
The validation prevents dots (used as key separators) but not other characters that could be problematic in storage keys depending on the adapter, such as colons (`:` is used as the tenant prefix separator in `LocalStorageAdapter` and `MemoryStorageAdapter`), null bytes, or leading underscores (used for reserved system keys). An entity with `id` containing `:` would produce a composite key that overlaps with a different tenant's namespace in LocalStorage.

No other issues.

---

## src/schema/id.ts

### [Medium] `generateId` uses `Math.random()` — not cryptographically secure (lines 3–9)
```ts
export function generateId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}
```
`Math.random()` uses a pseudo-random algorithm, not a CSPRNG. The 8-character base-62 ID space (~218 trillion combinations) is large enough to make brute-force guessing impractical for most applications, but applications that treat entity IDs as capability tokens (e.g., shareable doc IDs or URLs) should use `crypto.getRandomValues()`. The same issue exists in `tenant-manager.ts:generateTenantId`.

---

## src/schema/key-strategy.ts

No issues.

---

## src/schema/migration.ts

No issues. Migration version ordering and composition are handled correctly. The filter by `entityName` allows entity-scoped migrations.

---

## src/schema/types.ts

No issues. `BaseEntity` and `EntityDefinition` are well-typed.

---

## src/repo/repository.ts

### [High] `saveMany` bypasses `eventBus`, breaking dirty tracking (lines 107–111)
```ts
saveMany(entities: ...): ReadonlyArray<string> {
  this.assertNotDisposed();
  const ids = entities.map(entity => this.saveToStore(entity));
  if (ids.length > 0) {
    this.changeSignal.next();   // ← direct signal, skips eventBus
  }
  return ids;
}
```
`save()` calls `this.eventBus.emit({ entityName: this.definition.name })`, which:
1. Triggers the repository's own `changeSignal` via the registered listener, AND
2. Notifies `Strata.dirtyFlushListener`, which calls `this.dirtyTracker.markDirty()`.

`saveMany()` calls `this.changeSignal.next()` directly, bypassing the event bus entirely. As a result:
- `Strata.isDirty` remains `false` after `saveMany()`.
- The automatic local flush scheduler will not be triggered.
- Changes accumulate in memory without being persisted until the next unrelated event that causes a flush.

This is a functional regression: `saveMany()` silently does not behave equivalently to calling `save()` for each entity.

### [High] `deleteMany` has the same `eventBus` bypass (lines 129–135)
```ts
deleteMany(ids: ReadonlyArray<string>): void {
  // ...
  if (anyDeleted) {
    this.changeSignal.next();   // ← same bug: no eventBus.emit
  }
}
```
Bulk deletes do not mark the store as dirty. Tombstones written by `deleteMany` will not trigger local persistence until the next separately-initiated flush.

### [Medium] `parseEntityKey` silently returns wrong value for malformed IDs (lines 14–17)
```ts
function parseEntityKey(id: string): string {
  const lastDot = id.lastIndexOf('.');
  return id.substring(0, lastDot);
}
```
If `id` has no dot, `lastIndexOf` returns `-1`. `String.prototype.substring(0, -1)` treats negative values as `0`, returning `""`. This means `store.getEntity("", id)` is called, silently returning `undefined` instead of providing a meaningful error. The function should throw on invalid input to surface bugs early.

### [Medium] `query()` does not short-circuit on `limit` (lines 137–155)
```ts
const collected: (T & BaseEntity)[] = [];
for (const key of partitionKeys) {
  const partition = this.store.getPartition(key);
  for (const entity of partition.values()) {
    collected.push(entity as T & BaseEntity);
  }
}
```
All entities across all partitions are collected before any `where`, `range`, or `limit` filtering is applied. For an entity with many partitions and a small `limit`, this allocates and iterates far more objects than necessary. For large datasets this is O(n) in total entity count regardless of requested page size.

### [Low] `observeQuery` re-executes the full query on every entity change signal
```ts
return this.changeSignal.pipe(
  startWith(undefined as void),
  map(() => this.query(opts)),
  distinctUntilChanged((prev, next) => !resultsChanged(prev, next)),
);
```
The `changeSignal` fires when **any** entity in this entity type changes. The full `query(opts)` is re-executed on each signal. `distinctUntilChanged` prevents re-emission if results are unchanged, but the computation still happens on every signal. This could be costly for complex queries or entities with high write frequency.

---

## src/repo/query.ts

### [Low] `applyWhere` uses strict equality, breaks for Date and object fields (line 17)
```ts
keys.every(key => entity[key] === where[key])
```
Strict reference equality (`===`) will always return `false` when comparing `Date` objects by value (e.g., `where({ createdAt: new Date('2024-01-01') })`). This is a known limitation but is not documented and could confuse users who expect semantic field matching.

### [Low] `compareValues` silently returns 0 for non-comparable types (lines 1–11)
```ts
function compareValues(a: unknown, b: unknown): number {
  // handles Date, number, string
  return 0;   // ← objects, arrays, booleans all compare as equal
}
```
Sorting or range-filtering on boolean, array, or object fields silently produces incorrect results without any diagnostic error.

---

## src/repo/singleton-repository.ts

No issues. Correctly delegates to `Repository` with a fixed deterministic ID.

---

## src/repo/types.ts

No issues.

---

## src/reactive/event-bus.ts

No issues. Listener snapshot (`[...this.listeners]`) prevents issues with listeners removing themselves during `emit`.

---

## src/reactive/index.ts

No issues.

---

## src/reactive/types.ts

No issues.
