# Events & Signals

Complete inventory of all events emitted and consumed across the framework.

## Generic EventBus\<T\>

All events flow through `EventBus<T>` — a generic wrapper around RxJS `Subject<T>`.

```typescript
class EventBus<T> {
  readonly all$: Observable<T>;
  emit(event: T): void;
  dispose(): void;  // completes all downstream subscriptions
}
```

Defined in `reactive/event-bus.ts`. Two instances exist at runtime, both owned by `Strata`:

| Instance | Type | Passed To |
|----------|------|-----------|
| `eventBus` | `EventBus<EntityEvent>` | Repos, SyncEngine |
| `syncEventBus` | `EventBus<SyncEvent>` | SyncEngine, TenantManager |

## Signal Types

| Signal | Mechanism | Payload | Defined In |
|--------|-----------|---------|------------|
| **EntityEvent** | `EventBus<EntityEvent>` | `{ entityName, source, updates, deletes }` | `reactive/types.ts` |
| **SyncEvent** | `EventBus<SyncEvent>` | `{ type, source, target, result/error }` | `sync/types.ts` |
| **isDirty\$** | `BehaviorSubject<boolean>` | boolean | `utils/reactive-flag.ts` |
| **activeTenant\$** | `BehaviorSubject` piped | `Tenant \| undefined` | `tenant/types.ts` |

---

## EntityEvent

Carries affected entity IDs. Consumers can react to specific changes or re-query the store.

```typescript
type EntityEventSource = 'user' | 'sync';

type EntityEvent = {
  readonly entityName: string;
  readonly source: EntityEventSource;
  readonly updates: ReadonlyArray<string>;
  readonly deletes: ReadonlyArray<string>;
};
```

### Emitters

| Emitter | `source` | IDs | Location |
|---------|----------|-----|----------|
| `Repository.save()` | `'user'` | `updates: [id]` | `repo/repository.ts` |
| `Repository.saveMany()` | `'user'` | `updates: [...ids]` | `repo/repository.ts` |
| `Repository.delete()` | `'user'` | `deletes: [id]` | `repo/repository.ts` |
| `Repository.deleteMany()` | `'user'` | `deletes: [...ids]` | `repo/repository.ts` |
| `SyncEngine.emitEntityChanges()` | `'sync'` | `updates` + `deletes` per entity | `sync/sync-engine.ts` |

### Consumers

| Consumer | How | Action | Location |
|----------|-----|--------|----------|
| Repository `observe()`/`observeQuery()` | `eventBus.all$.pipe(filter(...))` | Re-query store, emit to subscribers | `repo/repository.ts` |
| Strata dirty tracking | `eventBus.all$.pipe(filter(e => e.source !== 'sync'))` | `dirtyTracker.set()` | `strata.ts` |

---

## SyncEvent

Lifecycle events for sync operations. Apps subscribe via `strata.observe('sync')`.

```typescript
type SyncEvent = {
  readonly type: 'sync-started' | 'sync-completed' | 'sync-failed';
  readonly source: SyncLocation;
  readonly target: SyncLocation;
  readonly result?: SyncResult;
  readonly error?: Error;
};
```

### Emitters

| Event | When | Location |
|-------|------|----------|
| `sync-started` | Before sync begins | `sync/sync-engine.ts` |
| `sync-completed` | After successful merge (carries stats) | `sync/sync-engine.ts` |
| `sync-failed` | On sync error, or cloud unreachable during tenant open | `sync/sync-engine.ts`, `tenant/tenant-manager.ts` |

### Consumers

| Consumer | Location |
|----------|----------|
| App via `strata.observe('sync')` | `strata.ts` |

---

## Observable Streams (app-facing)

Repository pipes off `eventBus.all$` filtered by entity name. No separate `changeSignal` — EntityEvent is the single source of truth.

| Method | Returns | Operators |
|--------|---------|-----------|
| `repo.observe(id)` | `Observable<T \| undefined>` | `filter(entityName)` → `startWith` → `map(get)` → `distinctUntilChanged` |
| `repo.observeQuery(opts?)` | `Observable<ReadonlyArray<T>>` | `filter(entityName)` → `startWith` → `map(query)` → `distinctUntilChanged` |
| `singleton.observe()` | `Observable<T \| undefined>` | Delegates to internal Repository |

### Lifecycle

- Observables pipe from `EventBus.all$`
- Completed when `EventBus.dispose()` is called (in `Strata.dispose()`)

---

## Dirty Tracking (isDirty\$)

Tracks whether there are unsynced local changes.

```
repo.save(entity)
  → eventBus.emit({ entityName, source: 'user', updates: [id], deletes: [] })
    → Strata subscription (source !== 'sync') → dirtyTracker.set() → isDirty$ = true
      → SyncEngine cloud sync succeeds → dirtyTracker.clear() → isDirty$ = false
```

### Transitions

| Direction | Trigger | Location |
|-----------|---------|----------|
| → `true` | EntityEvent with `source !== 'sync'` | `strata.ts` |
| → `false` | After successful cloud sync | `sync/sync-engine.ts` |

### App Surface

| API | Type |
|-----|------|
| `strata.observe('dirty')` | `Observable<boolean>` |
| `strata.isDirty` | `boolean` (sync getter) |

---

## Active Tenant (activeTenant\$)

Tracks the currently open tenant.

### Transitions

| Method | Effect |
|--------|--------|
| `TenantContext.set(tenant, keys)` | `activeTenant$` emits tenant |
| `TenantContext.clear()` | `activeTenant$` emits `undefined` |

### App Surface

| API | Type |
|-----|------|
| `strata.observe('tenant')` | `Observable<Tenant \| undefined>` |
| `tenants.activeTenant` | `Tenant \| undefined` (sync getter) |

---

## Event Flow

```
┌──────────────────────────────────────────────────────────┐
│                      USER ACTION                         │
│           repo.save() / saveMany() / delete()            │
└─────────────────────────┬────────────────────────────────┘
                          ↓
                 Store map modified
                          ↓
     eventBus.emit({ entityName, source: 'user', ... })
                   ┌──────┴──────┐
                   ↓             ↓
          Repository          Strata
          (filtered pipe)     (filtered pipe)
               ↓                 ↓
      observe()/            dirtyTracker.set()
      observeQuery()             ↓
      re-emit              isDirty$ = true
               ↓                 ↓
          UI updates        App reacts (e.g. save indicator)
```

```
┌──────────────────────────────────────────────────────────┐
│                     SYNC ENGINE                          │
│              sync(source, target, tenant)                │
└─────────────────────────┬────────────────────────────────┘
                          ↓
     syncEventBus.emit({ type: 'sync-started' })
                          ↓
                    merge partitions
                          ↓
          ┌───────────────┴───────────────┐
          ↓                               ↓
   emitEntityChanges()       syncEventBus.emit({ type: 'sync-completed' })
          ↓                               ↓
   eventBus.emit({              strata.observe('sync') subscribers
     source: 'sync', ...
   })
          ↓
   Repository pipes filter match
          ↓
   Observers re-fire (UI updates with synced data)
```

---

## App-Facing API

All framework events and state are exposed through a single overloaded method on `Strata`:

```typescript
strata.observe('entity')            // Observable<EntityEvent>
strata.observe('entity', 'task')    // Observable<EntityEvent> — filtered by name
strata.observe('sync')              // Observable<SyncEvent>
strata.observe('dirty')             // Observable<boolean>
strata.observe('tenant')            // Observable<Tenant | undefined>
```

---

## Known Issues

1. **No persistence events** — store flushes (memory → local) are silent; apps cannot know when data is locally persisted.
