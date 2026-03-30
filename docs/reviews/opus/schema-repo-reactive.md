# Review: schema/, repo/, reactive/

## src/schema/types.ts
No issues found.

## src/schema/id.ts

### [id.ts:4-9] Entity ID generation uses Math.random() (low)
```ts
export function generateId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}
```
Same as tenant ID: uses `Math.random()`, not cryptographically secure. For entity IDs within a partition, collision probability is low unless very high insert volumes are expected. A collision would silently overwrite an existing entity.

## src/schema/define-entity.ts
No issues found. Good validation in `wrapDeriveId` preventing dots in derived IDs.

## src/schema/key-strategy.ts
No issues found.

## src/schema/migration.ts
No issues found. Correct version ordering and entity-level filtering.

## src/schema/index.ts
No issues found.

---

## src/repo/types.ts
No issues found.

## src/repo/query.ts

### [query.ts:1-12] compareValues silently returns 0 for unsupported types (low)
```ts
function compareValues(a: unknown, b: unknown): number {
  // ...handles Date, number, string...
  return 0;
}
```
Boolean, array, and object values will compare as equal. If a user orders by a boolean field, the ordering will appear non-deterministic.

## src/repo/repository.ts

### [repository.ts:113-117] saveMany() doesn't emit through EventBus — other components miss notifications (high)
```ts
saveMany(
  entities: ReadonlyArray<T & Partial<BaseEntity>>,
): ReadonlyArray<string> {
  this.assertNotDisposed();
  const ids = entities.map(entity => this.saveToStore(entity));
  if (ids.length > 0) {
    this.changeSignal.next();  // <-- local signal only
  }
  return ids;
}
```
`saveMany()` calls `this.changeSignal.next()` which only notifies observers of this specific repository instance. It does NOT call `this.eventBus.emit()`, meaning:
- The `DirtyTracker` (which listens on the EventBus) won't be notified
- Data won't be marked as needing sync
- Cross-repository listeners will miss the change

Compare with `save()` which correctly calls `this.eventBus.emit()`.

### [repository.ts:133-142] deleteMany() has the same EventBus notification bug (high)
```ts
deleteMany(ids: ReadonlyArray<string>): void {
  this.assertNotDisposed();
  let anyDeleted = false;
  for (const id of ids) {
    if (this.deleteFromStore(id)) {
      anyDeleted = true;
    }
  }
  if (anyDeleted) {
    this.changeSignal.next();  // <-- local signal only
  }
}
```
Same issue as `saveMany()` — `deleteMany()` should call `this.eventBus.emit()` instead of (or in addition to) `this.changeSignal.next()`.

### [repository.ts:14-16] parseEntityKey assumes standard ID format (low)
```ts
function parseEntityKey(id: string): string {
  const lastDot = id.lastIndexOf('.');
  return id.substring(0, lastDot);
}
```
Extracts entity key by taking everything before the last dot. If a custom `deriveId` somehow produces an ID with a dot (which `wrapDeriveId` prevents), or if the entity name itself contains a dot, this would parse incorrectly. The `wrapDeriveId` guard mitigates this.

## src/repo/singleton-repository.ts
No issues found. Clean delegation to Repository.

## src/repo/index.ts
No issues found.

---

## src/reactive/types.ts
No issues found.

## src/reactive/event-bus.ts
No issues found. Correctly spreads listeners before iteration to handle mutations.

## src/reactive/index.ts
No issues found.
