# Domain docs

This repo uses a single-context layout:

- `CONTEXT.md` at the repo root: domain vocabulary and model.
- `docs/adr/`: architecture decision records.

## Before exploring

Read `CONTEXT.md` and ADRs relevant to the area being explored.

If these files do not exist, proceed silently. Do not flag their absence
or suggest creating them upfront. `/domain-modeling` creates them lazily
when terminology or decisions are resolved.

## Use the glossary's vocabulary

Use the terms defined in `CONTEXT.md` when naming domain concepts in
issues, proposals, hypotheses, and tests.

If a needed concept is absent, reconsider whether it belongs to the
domain; note genuine vocabulary gaps for `/domain-modeling`.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
including the ADR identifier and why reopening it may be worthwhile.
