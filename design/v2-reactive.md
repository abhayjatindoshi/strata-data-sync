# Reactive Layer

## Architecture

```
save(entity)
  → Map.set(id, entity)                    [sync]
  → entityTypeSubject.next()               [sync, no payload]
  → all observers of this entity type:
      pipe(map(() => readFromMap), distinctUntilChanged)
      → emit only if this observer's data changed
```

## Entity Type Subject

One `Subject<void>` per entity type. Created when the repo is created. Lives for the repo's lifetime.

```typescript
const changeSignal = new Subject<void>();

// Event bus registers one listener per entity type
eventBus.on((event) => {
  if (event.entityName === entityDef.name) {
    changeSignal.next();  // signal, no payload
  }
});
```

No payload in the signal — observers read from the Map themselves. This avoids coupling the event shape to observer needs.

## `observe(id)` — Single Entity

```typescript
function observe(id: string): Observable<T | undefined> {
  return changeSignal.pipe(
    startWith(undefined),                     // trigger initial emission
    map(() => store.get(entityKey, id)),       // sync Map lookup
    distinctUntilChanged((a, b) =>
      a?.id === b?.id && a?.version === b?.version
    ),
  );
}
```

- Fires on ANY change to the entity type (not just this ID)
- `Map.get(id)` is O(1) — negligible cost even if unrelated entities changed
- `distinctUntilChanged` suppresses emission if this entity's version didn't change

## `observeQuery(opts)` — Collection

```typescript
function observeQuery(opts?: QueryOptions<T>): Observable<ReadonlyArray<T>> {
  return changeSignal.pipe(
    startWith(undefined),                     // trigger initial emission
    map(() => query(opts)),                   // sync Map scan + filter + sort
    distinctUntilChanged(resultsChanged),
  );
}
```

- Re-scans Map with the observer's filter on every signal
- `distinctUntilChanged` compares via ID + version:

```typescript
function resultsChanged(prev: ReadonlyArray<T>, next: ReadonlyArray<T>): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].version !== next[i].version) return true;
  }
  return false;
}
```

No serialization. O(n) where n = result set size. Returns `false` (skip emission) if same entities with same versions.

## Observable Return Type

`Observable` (not `BehaviorSubject`):

- `.getValue()` is redundant — app calls `repo.get()` or `repo.query()` for sync reads
- Teardown on unsubscribe is automatic (RxJS handles it)
- No leaked subjects — unsubscribe cleans up the pipe, subject stays alive (shared per entity type)

## Batch Writes

`saveMany()` / `deleteMany()` — many Map writes, one signal:

```typescript
function saveMany(entities: T[]): string[] {
  const ids: string[] = [];
  for (const entity of entities) {
    ids.push(saveToStore(entity));  // Map.set, no signal
  }
  changeSignal.next();             // one signal after all writes
  return ids;
}
```

100 saves → 1 signal → observers re-scan once → 1 render. Not 100 signals → 100 renders.

Single `save()` emits immediately and synchronously. No debounce. Behavior is explicit — app uses `saveMany` for loops.

## Event Bus

Simple listener list:

```typescript
type EntityEventListener = (event: EntityEvent) => void;

type EntityEventBus = {
  on(listener: EntityEventListener): void;
  off(listener: EntityEventListener): void;
};
```

One listener registered per entity type repo. The listener calls `changeSignal.next()`.

Sync engine also fires events when cloud data is merged into the Map — observers update automatically.

## Cleanup

`dispose()`:
1. Completes all entity type subjects (`changeSignal.complete()`)
2. Removes all event bus listeners
3. Active observers receive completion signal → subscriptions end

Consumers who need cleanup call `subscription.unsubscribe()` — standard RxJS pattern.

## Concurrency (React Strict Mode)

React strict mode double-mounts components. With shared subjects per entity type:

```
Mount 1:  subscribe to changeSignal pipe → start receiving
Unmount:  unsubscribe (pipe torn down, subject stays alive)
Mount 2:  subscribe to changeSignal pipe → new pipe, fresh startWith emission
```

No race condition. No stale data. Each mount gets a fresh pipe off the shared subject. The subject is unaffected by individual subscribe/unsubscribe cycles.

Multiple components observing simultaneously:

```
Component A: observeQuery({ type: 'credit' })  → pipe off shared subject
Component B: observeQuery({ type: 'debit' })   → pipe off same subject
Component C: observe('transaction.2026-03.X')   → pipe off same subject

save(debit transaction):
  → changeSignal.next()
  → A: re-scans, no change → skip
  → B: re-scans, new entity → emit
  → C: Map.get(id), same version → skip
```

3 pipes fire, 1 emits. No thundering herd. No adapter I/O.
