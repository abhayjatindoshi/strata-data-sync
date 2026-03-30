# Full Repository Review — GPT 5.3 Codex

## Executive Summary
The repository is generally well-structured, with clear module boundaries across adapters, storage, sync, schema, and repository layers. Most files under src/ are clean and focused, and many core flows (eventing, HLC primitives, and adapter contracts) are straightforward and maintainable. The most important risks are around migration scoping, bulk repository event propagation, and tenant identity integrity. There are also several medium/low concerns around async scheduling pressure and predictable ID generation. Overall, correctness foundations are solid, but a small set of targeted fixes would materially improve data safety and operational reliability.

## Security Findings
- [src/strata.ts:258] changePassword accepts oldPassword but never validates/uses it, allowing password rotation without proving knowledge of the current secret (severity: high)
- [src/tenant/tenant-manager.ts:27] Tenant ID generation uses Math.random, which is predictable if tenant IDs are externally visible or guessed (severity: low)
- [src/schema/id.ts:7] Entity ID generation uses Math.random; predictable identifiers may be unsuitable where unpredictability is expected (severity: low)

## Critical Issues
- [src/store/flush.ts:23] Entity-scoped migration safety bug: loadPartitionFromAdapter calls migrateBlob(blob, migrations) without entityName, so migrations intended for a specific entity can run on unrelated blobs and corrupt data.
- [src/tenant/tenant-manager.ts:63] Tenant create flow does not enforce unique tenant IDs before persisting.
- [src/tenant/tenant-manager.ts:100] Persisting [...tenants, tenant] without duplicate-ID guard allows duplicate tenants and ambiguous load/delete behavior.

## Warnings
- [src/repo/repository.ts:114] saveMany bypasses eventBus.emit; bulk writes do not propagate dirty-tracking/cross-component events.
- [src/repo/repository.ts:147] deleteMany bypasses eventBus.emit; bulk deletes do not propagate dirty-tracking/cross-component events.
- [src/sync/sync-scheduler.ts:26] setInterval runs async sync work without in-flight guard, allowing overlap/backlog under slow sync conditions.
- [src/sync/sync-scheduler.ts:33] Cloud interval has the same overlap risk, compounding queue pressure.
- [src/sync/unified.ts:207] buildHlcMap trusts casted entities to include hlc; malformed entities can propagate undefined HLC values and break compare paths.
- [src/sync/sync-engine.ts:58] Deduplicated sync returns EMPTY_RESULT instead of the in-flight result, producing misleading zero-change metrics.
- [src/repo/repository.ts:15] parseEntityKey does not validate ID format; malformed IDs can route operations to empty/invalid partition keys.
- [src/repo/query.ts:11] compareValues returns 0 for unsupported types, silently weakening range filtering behavior.
- [src/repo/query.ts:53] applyOrderBy inherits compareValues fallback-to-0 behavior, causing silent no-op sorting for unsupported field types.
- [src/adapter/local-storage.ts:8] Base64 encode path spreads full byte array into String.fromCharCode; large payloads can throw RangeError and break persistence.

## Suggestions
- [src/store/flush.ts:23] Pass entityName to migrateBlob during partition load to enforce migration targeting.
- [src/tenant/tenant-manager.ts:63] Add duplicate ID detection (or deterministic conflict strategy) before create persists tenants.
- [src/repo/repository.ts:114] Emit through eventBus in saveMany/deleteMany (single batched event is sufficient) so dirty tracking remains accurate.
- [src/sync/sync-scheduler.ts:26] Add in-flight guards or switch to self-scheduling await loops to prevent interval overlap.
- [src/adapter/local-storage.ts:8] Replace spread-based base64 conversion with chunked conversion to avoid call-stack limits on larger blobs.
- [src/strata.ts:258] Validate oldPassword explicitly (e.g., re-derive and verify marker decrypt) before accepting password rotation.

## Positive Observations
- Adapter interfaces are cohesive and clearly separated between blob and storage abstractions.
- Sync flow is cleanly layered (diff/merge/plan/apply) and easier to reason about than monolithic sync logic.
- HLC primitives are compact and deterministic, providing a clear conflict-resolution baseline.
- Event bus and repository observable wiring are simple and maintainable for reactive consumption.
- Module exports and folder boundaries are consistent and easy to navigate.
