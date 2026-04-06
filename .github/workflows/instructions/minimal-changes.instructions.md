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
- `README.md`
- `docs/architecture.md`
- `docs/entities.md`
- `docs/partitioning.md`
- `docs/sync.md`
- `docs/tenancy.md`
- `docs/api.md`

## Git Rules
- Only commit on the `sprint` branch. Never use `main` or `master`.
- Never force push.
- Commit message format: `sprint-NNN: {summary}`
- Tag format: `sprint-NNN`