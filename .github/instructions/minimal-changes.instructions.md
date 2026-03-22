---
description: "Use when editing any file. Enforces minimal changes, prevents unnecessary refactoring, and protects frozen documentation files."
applyTo: "**"
---
# Minimal Changes & Protected Files

## Minimal Changes
- Only modify files directly related to the current task.
- Do not refactor surrounding code unless the task explicitly requires it.
- Do not add error handling, comments, or abstractions "just in case."
- If a change touches more than 3 files, explain why each file needs to change.
- Prefer editing an existing file over creating a new one.

## Protected Files — DO NOT MODIFY
The following files are frozen. No agent may edit them under any circumstances:
- `design/v2-decisions.md`
- `design/v2-architecture.md`
- `design/v2-adapter.md`
- `design/v2-tenant.md`
- `design/v2-persistence-sync.md`
- `design/v2-reactive.md`
- `design/v2-schema-repository.md`
- `design/v2-lifecycle.md`
- `design/README.md`

## Design Reference
- All implementation must follow the v2 design in `design/`. When in doubt, consult the relevant design doc.
- Rejected options in `design/v2-decisions.md` must NOT be reconsidered during implementation.
- If a design gap is found, raise it — do not invent a solution that contradicts existing decisions.

## Git Rules
- Only commit on the `sprint` branch. Never use `main` or `master`.
- Never force push.
- Commit message format: `sprint-NNN: {summary}`
- Tag format: `sprint-NNN`
