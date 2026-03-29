# Reactive Observations

## Overview

Strata uses RxJS Observables to push data changes to your UI. When any entity of a given type changes, observers re-evaluate and emit only if their specific data changed.

## Observing a Single Entity

```typescript
const repo = strata.repo(taskDef);

const task$ = repo.observe(taskId);
task$.subscribe((task) => {
  // fires when this specific task changes (or is deleted → undefined)
  console.log(task?.title);
});
```

- Returns `Observable<(T & BaseEntity) | undefined>`
- Emits immediately with current value
- Re-emits only when the entity's `version` changes
- Emits `undefined` if the entity is deleted

## Observing a Query

```typescript
const openTasks$ = repo.observeQuery({ where: { done: false } });
openTasks$.subscribe((tasks) => {
  // fires when the result set changes
  console.log(`${tasks.length} open tasks`);
});
```

- Returns `Observable<ReadonlyArray<T & BaseEntity>>`
- Emits immediately with current results
- Re-evaluates the query on every change to the entity type
- Only emits if the result set actually changed (same IDs + same versions = skip)

## How It Works

```
save(entity)
  → Map.set()                           [sync, instant]
  → signal.next()                       [sync, no payload]
  → all observers for this entity type:
      re-read from Map
      distinctUntilChanged → emit only if changed
```

Signals carry no payload — observers read directly from the in-memory Map. This decouples the event shape from observer needs.

## React Integration

```tsx
import { useEffect, useState } from 'react';

function useObservable<T>(observable$: Observable<T>, initial: T): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = observable$.subscribe(setValue);
    return () => sub.unsubscribe();
  }, [observable$]);
  return value;
}

function TaskList() {
  const repo = strata.repo(taskDef);
  const tasks = useObservable(
    repo.observeQuery({ where: { done: false } }),
    [],
  );

  return (
    <ul>
      {tasks.map(t => <li key={t.id}>{t.title}</li>)}
    </ul>
  );
}
```

**React Strict Mode** is safe — each mount gets a fresh pipe off the shared subject. Unmounting tears down the pipe, not the subject.

## Singleton Observation

```typescript
const settings = strata.repo(settingsDef);
const settings$ = settings.observe(); // no ID needed
settings$.subscribe((s) => {
  console.log(s?.theme);
});
```

## Cleanup

Call `subscription.unsubscribe()` when done (standard RxJS). When `strata.dispose()` is called, all subjects complete and active subscriptions end.

## Performance

- `observe(id)` does an O(1) Map lookup on each signal — negligible even if unrelated entities changed
- `observeQuery(opts)` re-scans the Map with your filter — O(n) where n = entities of that type
- `distinctUntilChanged` compares by `id` + `version` — no deep equality, no serialization
- 100 saves via `saveMany()` → 1 signal → 1 re-scan → 1 render
