# Sprint 001

## Goal
Establish the foundational entity type system, ID/key generation, and pluggable key strategy infrastructure.

## Tasks

### Module: `entity` (foundation — no dependencies)
- [x] TASK-001: Define `BaseEntity` interface with required fields (`id`, `partitionKey`, `createdAt`, `updatedAt`) [status: done]
- [x] TASK-002: Implement entity ID generation — unique ID suffix utility (e.g., nano-id or UUID-based) [status: done]
- [x] TASK-003: Implement partition key encoding/decoding utilities [status: done]

### Module: `schema` (depends on entity types)
- [x] TASK-004: Define `EntityDef<T>` type and `defineEntity<T>()` factory function with Zod schema integration [status: done]

### Module: `key-strategy` (depends on entity types)
- [x] TASK-005: Define `KeyStrategy` interface for pluggable partition key strategies [status: done]
- [x] TASK-006: Implement `DateKeyStrategy` — date-based partition key strategy [status: done]

### Integration
- [x] TASK-007: Wire entity key composition — strategy + ID generation produce full entity key [status: done]
- [x] TASK-008: Create barrel exports (`index.ts`) for `entity`, `schema`, and `key-strategy` modules [status: done]

## Bugs Carried Over

_None — this is the first sprint._
