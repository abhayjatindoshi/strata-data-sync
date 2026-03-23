---
description: "Use when editing any file. Enforces minimal changes, prevents unnecessary refactoring, and protects frozen documentation files."
applyTo: "**"
---

# Minimal Changes

## Scope
- Only change what the current task requires
- No "while I'm here" refactors or cleanup of surrounding code
- If you see something unrelated that needs fixing, log it — don't fix it now

## Restrictions
- Do not rename existing functions, types, or files unless the task explicitly requires it
- Do not add npm packages unless the task specifically calls for it
- Do not reorganize folder structure unless the task explicitly requires it
- Do not add comments, docstrings, or type annotations to code you did not change

## Timestamps
- Use ISO 8601 format in all documentation and tracking files: `2026-03-23T18:45:00Z`
- Include timestamps in sprint tasks, reviews, and newsletter entries
